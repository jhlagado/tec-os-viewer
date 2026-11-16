// Exercise saving and pending guest writes through the real page controls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { card, web } from './lib/page.mjs';
import { open, serve } from './lib/serve.mjs';
import { fromTecos } from './lib/root.mjs';
import { program } from './lib/guest-probe.mjs';
import { parseContainer, findVolume, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function downloadImage(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveimg')]);
  assert.equal(download.suggestedFilename(), 'tecos-card.img');
  return new Uint8Array(readFileSync(await download.path()));
}
async function storedSummary(page, block) {
  return page.evaluate(block => new Promise((resolve, reject) => {
    const request = indexedDB.open('tecos', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('cards'), get = transaction.objectStore('cards').get('current');
      get.onerror = () => reject(get.error);
      transaction.oncomplete = async () => {
        try {
          const bytes = new Uint8Array(get.result);
          const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
          resolve({ bytes: bytes.length, sha256: Array.from(hash, b => b.toString(16).padStart(2, '0')).join(''),
            block: Array.from(bytes.subarray(block * 512, (block + 1) * 512)) });
        } catch (error) { reject(error); }
        finally { db.close(); }
      };
      transaction.onabort = () => reject(transaction.error);
    };
  }), block);
}

test('a paused guest has pending data while its already stored card remains saved and downloadable', { timeout: 120_000 }, async t => {
  web();
  const buildBytes = readFileSync(new URL('../dist/build.json', import.meta.url));
  const pageBuild = { ...JSON.parse(buildBytes), sha256: sha(buildBytes) };
  const image = await card(), v = findVolume(parseContainer(image), 'A'), fs = new CpmVolume(volumePayload(image, v), v.g);
  const p = program(), code = p.bytes.slice();
  assert.deepEqual([...code.subarray(3, 8)], [0x0e, 22, 0xcd, 5, 0]);
  code[4] = 15; // Open a preallocated file, so its existing data location is independently known.
  fs.write('OBSPEND.DAT', new Uint8Array(512)); fs.write('OBSPROBE.COM', code);
  const allocation = fs.find('OBSPEND.DAT').entries[0].blocks[0];
  const block = v.start + allocation * fs.blockBytes / 512;
  const { chromium } = fromTecos('playwright'), browser = await chromium.launch(); t.after(() => browser.close());
  const server = await serve(); t.after(() => server.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, image, 'tms', '40');
  t.after(() => context.close());
  const facts = [], retainedImages = [], artifacts = process.env.TEST_EVIDENCE_DIR;
  let success = false, captureError = null;
  if (artifacts) mkdirSync(artifacts, { recursive: true });
  const retainImage = (name, bytes) => {
    if (artifacts) { writeFileSync(join(artifacts, name), bytes); retainedImages.push({ name, bytes: bytes.length, sha256: sha(bytes) }); }
  };
  try {
    await page.waitForFunction(() => globalThis.tecos?.screen().some(line => /^A:SYSTEM>\s*$/.test(line)), null, { timeout: 60_000 });
    await page.waitForFunction(() => document.getElementById('browserstatus').textContent === 'Saved card image in this browser');
    await page.waitForFunction(() => /^Guest cache: (?:last check: )?0 pending blocks$/.test(document.getElementById('gueststatus').textContent));
    const before = await downloadImage(page);
    retainImage('before.img', before);
    facts.push({ phase: 'baseline', guest: await page.locator('#gueststatus').textContent(), browser: await page.locator('#browserstatus').textContent(), image: sha(before) });
    assert.deepEqual(before.subarray(block * 512, (block + 1) * 512), new Uint8Array(512));
    await page.focus('#tms'); await page.keyboard.type('obsprobe\n');
    const expectedPending = 'Guest cache: last check: 1 pending blocks';
    await page.waitForFunction(expected => document.getElementById('gueststatus').textContent === expected, expectedPending, { timeout: 30_000 });
    facts.push({ phase: 'new pending', guest: await page.locator('#gueststatus').textContent() });
    await page.click('#pause'); assert.equal(await page.locator('#pause').textContent(), 'Run');
    await page.waitForFunction(() => document.getElementById('browserstatus').textContent === 'Saved card image in this browser');
    facts.push({ phase: 'paused', guest: await page.locator('#gueststatus').textContent(), browser: await page.locator('#browserstatus').textContent(), pause: await page.locator('#pause').textContent() });
    assert.equal(await page.locator('#gueststatus').textContent(), expectedPending);
    await page.waitForTimeout(2200); // Remain paused longer than the configured autosave interval.
    const saved = await storedSummary(page, block), downloaded = await downloadImage(page);
    retainImage('after.img', downloaded);
    facts.push({ phase: 'after interval and download', guest: await page.locator('#gueststatus').textContent(), browser: await page.locator('#browserstatus').textContent(), saved, downloaded: sha(downloaded) });
    assert.equal(saved.sha256, sha(downloaded)); assert.equal(saved.bytes, downloaded.length);
    assert.deepEqual(downloaded, before, 'no OS call or browser action committed the pending RAM record');
    assert.deepEqual(saved.block, [...new Uint8Array(512)]);
    assert.deepEqual(downloaded.subarray(block * 512, (block + 1) * 512), new Uint8Array(512));
    assert.equal(await page.locator('#gueststatus').textContent(), expectedPending);
    assert.equal(await page.locator('#browserstatus').textContent(), 'Saved card image in this browser');
    const recovery = page.locator('details.note'); await recovery.locator('summary').click();
    assert.equal(await recovery.locator('pre').isVisible(), true);
    assert.match(await recovery.locator('pre').textContent(), /CD A:SYSTEM/);
    facts.push({ phase: 'visible recovery', commands: await recovery.locator('pre').textContent() });
    assert.deepEqual(errors, []);
    success = true;
  } finally {
    try {
      facts.push({ phase: 'final page', guest: await page.locator('#gueststatus').textContent(),
        browser: await page.locator('#browserstatus').textContent(), pause: await page.locator('#pause').textContent(),
        screen: await page.evaluate(() => globalThis.tecos?.screen() ?? []) });
      if (artifacts) await page.screenshot({ path: join(artifacts, 'page.png'), fullPage: true });
    } catch (error) { captureError = error.message; }
    console.log(JSON.stringify({ case: 'browser-paused-pending-final', success, captureError, pageErrors: errors,
      program: sha(code), codeHex: Buffer.from(code).toString('hex'), allocation, block, facts,
      browserSaveScope: 'prior completed transaction; unchanged-card autosave may skip',
      pageBuild, retainedImages, imageRetentionScope: artifacts ? 'actual retained files listed; availability can be partial on failure' : 'hashes and equality assertions only' }));
    if (success && captureError) throw Error(`Page evidence capture failed: ${captureError}`);
  }
});
