// A real browser transaction must not stand in for the guest's pending data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { card, web } from './lib/assets.mjs';
import { open, serve } from './lib/serve.mjs';
import { fromTecos } from './lib/root.mjs';
import { createContainer, parseContainer, findVolume, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const costBytes = readFileSync(new URL('./fixtures/viewer-feedback-cost.json', import.meta.url));
const costCriteria = JSON.parse(costBytes);
const pendingText = 'Guest cache: last check: 1 pending blocks';
const savedText = 'Saved card image in this browser';
function fileSystem(image) {
  const v = findVolume(parseContainer(image), 'A');
  return new CpmVolume(volumePayload(image, v), v.g);
}
function guestProgram() {
  const bytes = [], pointers = [], labels = {};
  const de = name => { bytes.push(0x11, 0, 0); pointers.push([bytes.length - 2, name]); };
  const bdos = fn => bytes.push(0x0e, fn, 0xcd, 5, 0);
  de('marker'); bdos(22); de('fcb'); bdos(15); de('data'); bdos(26); de('fcb'); bdos(21);
  labels.afterWrite = 0x100 + bytes.length;
  bytes.push(0xc3, labels.afterWrite & 255, labels.afterWrite >> 8);
  for (const [label, name] of [['marker', 'OBSREV  DAT'], ['fcb', 'OBSPEND DAT']]) {
    assert.equal(name.length, 11); labels[label] = 0x100 + bytes.length;
    bytes.push(0, ...new TextEncoder().encode(name), ...new Array(24).fill(0));
  }
  labels.data = 0x100 + bytes.length; bytes.push(...new Array(128).fill(0x5a));
  for (const [at, name] of pointers) { bytes[at] = labels[name] & 255; bytes[at + 1] = labels[name] >> 8; }
  return { bytes: Uint8Array.from(bytes), labels };
}
async function testCard(small) {
  const original = await card();
  if (!small) return original;
  const source = findVolume(parseContainer(original), 'A');
  const image = createContainer([{ geometry: source.g.name, label: 'SYSTEM', mount: 'A' }], { drives: 4 });
  const target = findVolume(parseContainer(image), 'A');
  volumePayload(image, target).set(volumePayload(original, source));
  return image;
}

// Keep native transactions and requests. Optional queued reads delay only
// completion, allowing the page's Saving state to be checked before commit.
function observeTransactions() {
  const p = window.saveProbe = { armed: false, hold: false, starts: [], completions: [], aborts: [], errors: [], putSuccesses: 0, keepReads: 0, keepError: null, recordRates: false, speedUpdates: [], rateObserverError: null };
  const status = () => ({ at: performance.now(), guest: document.getElementById('gueststatus')?.textContent,
    browser: document.getElementById('browserstatus')?.textContent, pause: document.getElementById('pause')?.textContent });
  const watchSpeed = () => {
    const element = document.getElementById('speed');
    if (!element) { p.rateObserverError = 'speed element missing'; return; }
    let previousAt = null;
    new MutationObserver(() => {
      const at = performance.now(), label = element.textContent;
      if (p.armed && p.recordRates) p.speedUpdates.push({ previousAt, at, label, MHz: Number.parseFloat(label),
        startedTransactions: p.starts.length, completedTransactions: p.completions.length });
      previousAt = at;
    }).observe(element, { childList: true, characterData: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchSpeed, { once: true });
  else watchSpeed();
  const transact = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = transact.apply(this, args);
    if (!p.armed || args[1] !== 'readwrite') return tx;
    const id = p.starts.length; p.starts.push({ id, ...status() });
    tx.addEventListener('complete', () => p.completions.push({ id, ...status() }));
    tx.addEventListener('abort', () => p.aborts.push({ id, ...status(), error: tx.error?.message ?? null }));
    tx.addEventListener('error', () => p.errors.push({ id, ...status(), error: tx.error?.message ?? null }));
    if (p.hold) {
      const store = tx.objectStore('cards');
      const again = () => {
        if (!p.hold) return;
        try {
          const request = store.get('__save_probe__'); p.keepReads++;
          request.addEventListener('success', again);
          request.addEventListener('error', () => { p.keepError = request.error?.message ?? 'keep-alive read failed'; p.hold = false; });
        } catch (error) { p.keepError = error.message; p.hold = false; }
      };
      again();
    }
    return tx;
  };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = put.apply(this, args);
    if (p.armed && this.name === 'cards') request.addEventListener('success', () => p.putSuccesses++);
    return request;
  };
}
async function downloadImage(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveimg')]);
  assert.equal(download.suggestedFilename(), 'tecos-card.img');
  return new Uint8Array(readFileSync(await download.path()));
}
async function storedSummary(page, block, measureCopies = false) {
  return page.evaluate(({ block, measureCopies }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('tecos', 1); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('cards'), get = tx.objectStore('cards').get('current');
      get.onerror = () => reject(get.error); tx.onabort = () => reject(tx.error);
      tx.oncomplete = async () => {
        try {
          const bytes = new Uint8Array(get.result), copyMs = []; let copy;
          if (measureCopies) for (let i = 0; i < 8; i++) {
            const began = performance.now(); copy = new Uint8Array(bytes); copyMs.push(performance.now() - began);
          }
          const digest = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), v => v.toString(16).padStart(2, '0')).join('');
          resolve({ bytes: bytes.length, sha256: await digest(bytes), block: Array.from(bytes.subarray(block * 512, (block + 1) * 512)),
            copyMs, lastCopySha256: copy ? await digest(copy) : null,
            copyScope: 'representative owned copies of actual stored card bytes, not intercepted coordinator snapshots',
            memoryScope: 'post-copy and digest sample, not peak memory',
            memoryAfter: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null });
        } catch (error) { reject(error); }
        finally { db.close(); }
      };
    };
  }), { block, measureCopies });
}
function recorder(name, page, browser, errors, program, pageBuild, imageBytes, allocation, block) {
  const facts = [], images = [], dir = process.env.TEST_EVIDENCE_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  let success = false;
  return {
    facts,
    pass() { success = true; },
    image(suffix, bytes) {
      if (dir) { const file = `${name}-${suffix}.img`; writeFileSync(join(dir, file), bytes); images.push({ name: file, bytes: bytes.length, sha256: sha(bytes) }); }
    },
    async phase(phase, extra = {}) {
      const state = await page.evaluate(() => ({ guest: document.getElementById('gueststatus').textContent,
        browser: document.getElementById('browserstatus').textContent, pause: document.getElementById('pause').textContent,
        probe: structuredClone(window.saveProbe) }));
      facts.push({ phase, ...state, ...extra }); return state;
    },
    async finish() {
      let captureError = null, releaseError = null, writeError = null, logError = null;
      try {
        await this.phase('final page', { screen: await page.evaluate(() => globalThis.tecos?.screen() ?? []) });
        if (dir) await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
      } catch (error) { captureError = error.message; }
      try { await page.evaluate(() => { if (window.saveProbe) window.saveProbe.hold = false; }); }
      catch (error) { releaseError = error.message; }
      const record = { case: name, success, captureError, releaseError, pageErrors: errors, browserVersion: browser.version(),
        costCriteriaSha256: sha(costBytes), program: { sha256: sha(program.bytes), codeHex: Buffer.from(program.bytes).toString('hex'), labels: program.labels },
        imageBytes, allocation, block, facts, retainedImages: images, pageBuild,
        finalFactsScope: 'final page snapshot precedes cleanup release; record file is written afterward',
        imageRetentionScope: dir ? 'only actual listed files retained; availability can be partial on failure' : 'hashes and assertions only' };
      try { if (dir) writeFileSync(join(dir, `${name}.json`), JSON.stringify(record, null, 2) + '\n'); }
      catch (error) { writeError = error.message; }
      try { console.log(JSON.stringify({ ...record, writeError })); }
      catch (error) { logError = error.message; }
      if (success && (captureError || releaseError || writeError || logError)) {
        throw Error(`Page evidence/cleanup failed: ${captureError ?? releaseError ?? writeError ?? logError}`);
      }
    },
  };
}
async function fixture(t, small, name) {
  web();
  const build = readFileSync(new URL('../dist/build.json', import.meta.url));
  const pageBuild = { ...JSON.parse(build), sha256: sha(build) };
  const image = await testCard(small), fs = fileSystem(image), program = guestProgram();
  if (!small) assert.equal(image.length, costCriteria.scope.cardBytes);
  assert.equal(fs.find('OBSREV.DAT'), undefined);
  fs.write('OBSPEND.DAT', new Uint8Array(512)); fs.write('REVPROBE.COM', program.bytes);
  const v = findVolume(parseContainer(image), 'A'), allocation = fs.find('OBSPEND.DAT').entries[0].blocks[0];
  const block = v.start + allocation * fs.blockBytes / 512;
  const { chromium } = fromTecos('playwright'), browser = await chromium.launch(); t.after(() => browser.close());
  const server = await serve(); t.after(() => server.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, image, 'tms', '40', {
    setup: context => context.addInitScript(observeTransactions),
  });
  t.after(() => context.close());
  return { page, errors, block, evidence: recorder(name, page, browser, errors, program, pageBuild, image.length, allocation, block) };
}
async function baseline(f, hold) {
  const { page, evidence, block } = f;
  await page.waitForFunction(() => globalThis.tecos?.screen().some(line => /^A:SYSTEM>\s*$/.test(line)), null, { timeout: 60_000 });
  await page.waitForFunction(() => document.getElementById('browserstatus').textContent === 'Saved card image in this browser');
  await page.waitForFunction(() => /^Guest cache: (?:last check: )?0 pending blocks$/.test(document.getElementById('gueststatus').textContent));
  const before = await downloadImage(page); evidence.image('before', before);
  assert.deepEqual(before.subarray(block * 512, (block + 1) * 512), new Uint8Array(512));
  const predicted = before.slice(); fileSystem(predicted).write('OBSREV.DAT', new Uint8Array());
  assert.notEqual(sha(predicted), sha(before));
  await evidence.phase('baseline', { image: sha(before), predicted: sha(predicted) });
  await page.evaluate(hold => { window.saveProbe.armed = true; window.saveProbe.hold = hold; window.saveProbe.recordRates = !hold; }, hold);
  await page.focus('#tms'); await page.keyboard.type('revprobe\n');
  await page.waitForFunction(expected => document.getElementById('gueststatus').textContent === expected, pendingText, { timeout: 30_000 });
  await evidence.phase('new pending'); return { before, predicted };
}
async function finalBytes(f, predicted, copies = false) {
  const { page, evidence, block } = f;
  const stored = await storedSummary(page, block, copies), after = await downloadImage(page); evidence.image('after', after);
  await evidence.phase('completed card', { stored, downloaded: sha(after), predicted: sha(predicted) });
  assert.deepEqual(after, predicted); assert.equal(stored.sha256, sha(predicted)); assert.equal(stored.bytes, predicted.length);
  assert.deepEqual(stored.block, [...new Uint8Array(512)]);
  assert.equal(fileSystem(after).find('OBSREV.DAT').records, 0);
  assert.equal(fileSystem(after).find('OBSPEND.DAT').records, 4);
  assert.equal(await page.locator('#gueststatus').textContent(), pendingText);
  assert.equal(await page.locator('#browserstatus').textContent(), savedText);
  assert.deepEqual(f.errors, []); return stored;
}

test('a real browser save completes after the guest is paused with pending data', { timeout: 120_000 }, async t => {
  const f = await fixture(t, true, 'browser-active-save'), { page, evidence } = f;
  try {
    const { predicted } = await baseline(f, true);
    await page.waitForFunction(() => window.saveProbe.starts.length === 1 && window.saveProbe.putSuccesses === 1 && window.saveProbe.keepReads > 0);
    await page.waitForFunction(() => /^Saving card image/.test(document.getElementById('browserstatus').textContent));
    await page.click('#pause');
    const held = await evidence.phase('native put succeeded, transaction held');
    assert.equal(held.guest, pendingText); assert.equal(held.pause, 'Run'); assert.match(held.browser, /^Saving card image/);
    assert.equal(held.probe.completions.length, 0); assert.deepEqual(held.probe.aborts, []); assert.deepEqual(held.probe.errors, []); assert.equal(held.probe.keepError, null);
    const pending = await downloadImage(page); evidence.image('pending', pending); assert.deepEqual(pending, predicted);
    await page.evaluate(() => { window.saveProbe.hold = false; });
    await page.waitForFunction(() => window.saveProbe.completions.length === 1 && document.getElementById('browserstatus').textContent === 'Saved card image in this browser');
    const completed = await evidence.phase('native transaction completed');
    assert.equal(completed.pause, 'Run'); assert.equal(completed.guest, pendingText);
    assert.equal(completed.probe.completions[0].guest, pendingText); assert.equal(completed.probe.completions[0].pause, 'Run');
    assert.deepEqual(completed.probe.aborts, []); assert.deepEqual(completed.probe.errors, []); assert.equal(completed.probe.keepError, null);
    await finalBytes(f, predicted); evidence.pass();
  } finally { await evidence.finish(); }
});

test('normal browser saving meets its rate, control and card-copy bounds', { timeout: 120_000 }, async t => {
  const f = await fixture(t, false, 'browser-save-cost'), { page, evidence } = f;
  try {
    const { predicted } = await baseline(f, false), controls = [];
    await page.waitForFunction(count => window.saveProbe.speedUpdates.length >= count, costCriteria.freshRateUpdates, { timeout: 15_000 });
    const rates = await page.evaluate(count => { window.saveProbe.recordRates = false; return window.saveProbe.speedUpdates.slice(0, count); }, costCriteria.freshRateUpdates);
    for (const [i, rate] of rates.entries()) {
      assert.match(rate.label, /^\d+\.\d{2} MHz$/); assert.ok(Number.isFinite(rate.MHz) && rate.MHz > 0);
      assert.ok(Number.isFinite(rate.at) && (i === 0 || rate.at > rates[i - 1].at));
    }
    for (const expected of costCriteria.individualControlStates) {
      await page.locator('#pause').scrollIntoViewIfNeeded();
      const began = performance.now(); await page.click('#pause'); const ms = performance.now() - began;
      assert.equal(await page.locator('#pause').textContent(), expected); assert.ok(Number.isFinite(ms) && ms > 0);
      controls.push({ expected, roundTripMs: ms });
    }
    await page.waitForFunction(() => window.saveProbe.completions.length >= 1 && document.getElementById('browserstatus').textContent === 'Saved card image in this browser');
    const measured = await evidence.phase('normal save and controls', { rates, controls,
      rateScope: 'four fresh speed-label DOM updates around the normal save; timestamps are observation times, not private CPU window boundaries',
      controlScope: 'three individual real button clicks (pause, run, pause) after scrolling into view, including automation overhead' });
    assert.equal(measured.probe.rateObserverError, null); assert.equal(measured.probe.hold, false); assert.equal(measured.pause, 'Run'); assert.equal(measured.guest, pendingText);
    assert.ok(measured.probe.starts.length >= 1 && measured.probe.putSuccesses >= 1);
    assert.deepEqual(measured.probe.aborts, []); assert.deepEqual(measured.probe.errors, []); assert.equal(measured.probe.keepError, null);
    const costs = await finalBytes(f, predicted, true);
    assert.equal(costs.copyMs.length, costCriteria.representativeCopyCount);
    assert.ok(costs.copyMs.every(ms => Number.isFinite(ms) && ms >= 0));
    assert.equal(costs.lastCopySha256, costs.sha256);
    const saveOverlap = rates.some(rate => Number.isFinite(rate.previousAt) && rate.previousAt < rate.at &&
      measured.probe.completions.some(done => {
        const start = measured.probe.starts.find(start => start.id === done.id);
        return start && Number.isFinite(start.at) && Number.isFinite(done.at) && start.at < done.at &&
          rate.previousAt < done.at && rate.at > start.at;
      }));
    await evidence.phase('cost gate observations', { saveOverlap, rates, controls, copyMs: costs.copyMs });
    assert.ok(rates.every(rate => rate.MHz >= costCriteria.minimumPublicMHz));
    assert.ok(controls.every(control => control.roundTripMs <= costCriteria.maximumIndividualControlRoundTripMs));
    if (costCriteria.requireNativeSaveObservationOverlap) assert.equal(saveOverlap, true, 'a rate interval overlaps the real unheld transaction');
    assert.ok(costs.copyMs.every(ms => ms <= costCriteria.maximumRepresentativeCopyMs));
    evidence.pass();
  } finally { await evidence.finish(); }
});
