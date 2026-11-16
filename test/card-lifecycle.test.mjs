// Exercise the real request handlers and coordinator with controlled I/O.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContainer, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { pageHarness, gate, tick } from './lib/lifecycle-page.mjs';
const card = () => createContainer([{ geometry: 'G1M', label: 'SYSTEM', mount: 'A' }]);
const fileSystem = image => { const v = parseContainer(image).volumes[0]; return new CpmVolume(volumePayload(image, v), v.g); };
const opening = image => ({ target: { files: [{ arrayBuffer: async () => image.buffer }], value: 'selected' } });
const copying = () => ({ target: { files: [{ name: 'KEEP.TXT', arrayBuffer: async () => Uint8Array.of(65).buffer }], value: 'selected' } });

test('a card opened while the old card is still saving is the card stored', async () => {
  const old = card(), next = card(), held = gate(), stored = [];
  fileSystem(next).write('NEXT.TXT', Uint8Array.of(78));
  const p = pageHarness(old, { saveCard: async image => { if (!stored.length) await held.promise; stored.push(image.slice()); } });
  p.persistence.dirty(); const saving = p.persistence.autosave(); await tick();
  const opened = p.handlers.openimg(opening(next)); await tick();
  assert.equal(p.state.card, old, 'replacement is not published before its transaction');
  held.release(); await Promise.all([saving, opened]);
  assert.equal(Buffer.compare(stored.at(-1), next), 0); assert.equal(Buffer.compare(p.state.card, next), 0);
  assert.equal(p.persistence.status().saved, true);
});

test('power-on stops the old machine before it prepares the card', async () => {
  const image = card(), seen = [];
  const p = pageHarness(image, { prepareCard: staged => { seen.push(p.state.machine); assert.notEqual(staged, image); return { changed: true }; } });
  const old = p.state.machine; await p.context.powerOn();
  assert.deepEqual(seen, [null]); assert.notEqual(p.state.machine, old);
  assert.equal(p.state.machine.options.sdImage, image);
});

test('a slow earlier starter cannot overwrite a subsequently opened image', async () => {
  const first = card(), next = card(), held = gate(), stored = [];
  fileSystem(next).write('OPENED.TXT', Uint8Array.of(79));
  const p = pageHarness(card(), { starterCard: async () => { await held.promise; return first; }, saveCard: async image => stored.push(image.slice()) });
  const starter = p.handlers.starter(); const opened = p.handlers.openimg(opening(next));
  await tick(); assert.equal(stored.length, 0); held.release(); await Promise.all([starter, opened]);
  assert.equal(stored.length, 2); assert.equal(Buffer.compare(stored[0], first), 0); assert.equal(Buffer.compare(stored[1], next), 0); assert.equal(Buffer.compare(p.state.card, next), 0);
});

test('detached machine write callbacks cannot dirty replacement or same-array preparation', async () => {
  const image = card(), p = pageHarness(image, { prepareCard: () => ({ changed: true }) });
  await p.context.powerOn(); const first = p.state.machine;
  await p.context.powerOn(); assert.equal(p.state.card, image);
  const token = p.persistence.token(); first.options.onSdWrite();
  assert.deepEqual(p.persistence.token(), token);
  p.state.machine.options.onSdWrite(); assert.equal(p.persistence.revision, token.revision + 1);
  const second = p.state.machine; await p.handlers.openimg(opening(card()));
  const replacement = p.persistence.token(); second.options.onSdWrite(); assert.deepEqual(p.persistence.token(), replacement);
});

test('postcommit reset failure reports copied bytes without claiming an unchanged-card refusal', async () => {
  const image = card(), p = pageHarness(image); p.state.machine.reset = () => { throw Error('reset failed'); };
  await p.handlers.putfile(copying());
  assert.ok(fileSystem(image).find('KEEP.TXT')); assert.ok(fileSystem(p.writes[0]).find('KEEP.TXT'));
  assert.match(p.elements.cardproblem.textContent, /Files copied; restart or refresh failed/);
  assert.equal(p.persistence.status().saved, true);
  assert.equal(p.state.machine, null);
  p.context.frame(10); assert.equal(p.state.machine, null);
});

test('unread-record protection survives imports, replacements and preferences', async () => {
  const image = card(); let downloaded;
  const p = pageHarness(image, { starterCard: async () => card(), download: bytes => { downloaded = bytes; }, prepareCard: () => ({ changed: true }) });
  p.persistence.protectedRecord = true;
  await p.handlers.putfile(copying()); await p.handlers.starter(); await p.handlers.openimg(opening(card()));
  p.elements.profile.value = '80'; await p.handlers.profile({ target: { value: '80' } });
  p.elements.display.value = 'glcd'; await p.handlers.display({ target: { value: 'glcd' } });
  await p.handlers.reset(); await p.handlers.power(); await p.persistence.autosave();
  assert.equal(p.writes.length, 0); assert.equal(p.persistence.protectedRecord, true); assert.equal(p.persistence.status().saved, false);
  assert.match(p.elements.browserstatus.textContent, /stored card could not be read/);
  p.handlers.saveimg(); assert.deepEqual(downloaded, p.state.card); assert.notEqual(downloaded, p.state.card);
});


test('startup read owns the FIFO before a later Open request can publish', async () => {
  const stored = card(), opened = card(), held = gate(), writes = [];
  fileSystem(opened).write('OPENED.TXT', Uint8Array.of(79));
  const p = pageHarness(card(), { loadCard: async () => { await held.promise; return stored; }, saveCard: async bytes => writes.push(bytes.slice()) });
  const startup = p.start(); const openingRequest = p.handlers.openimg(opening(opened));
  await tick(); assert.equal(writes.length, 0); held.release();
  await Promise.all([startup, openingRequest]);
  assert.equal(Buffer.compare(p.state.card, opened), 0); assert.ok(fileSystem(p.state.card).find('OPENED.TXT'));
  assert.equal(Buffer.compare(writes.at(-1), opened), 0);
});

test('successful Open clears an older opening error without clearing unread-record protection', async () => {
  const p = pageHarness(card());
  await p.handlers.openimg(opening(Uint8Array.of(1, 2, 3)));
  assert.match(p.elements.cardproblem.textContent, /Not opened/);
  p.persistence.protectedRecord = true;
  await p.handlers.openimg(opening(card()));
  assert.equal(p.elements.cardproblem.textContent, '');
  assert.match(p.elements.browserstatus.textContent, /saving disabled/);
});

test('actual frame does not step a lifecycle-suppressed or paused guest, and fences replaced continuations', async () => {
  let steps = 0, renders = 0; const held = gate();
  const p = pageHarness(card(), { render: () => { renders++; } });
  const old = p.state.machine; old.step = () => { steps++; old.cycles += 4; };
  const pending = p.context.lifecycle(() => held.promise);
  p.context.frame(10); assert.equal(steps, 0);
  held.release(); await pending; p.state.running = false;
  p.context.frame(20); assert.equal(steps, 0);
  p.state.running = true;
  old.step = () => { steps++; old.cycles += 4; p.state.machineGeneration++; };
  p.context.frame(30); assert.equal(steps, 1); assert.equal(renders, 0);
});


test('an unchanged-card refresh failure restores the exact machine and observer pair', async () => {
  const p = pageHarness(card(), { refreshCard: () => { throw Error('refresh failed'); } });
  const machine = p.state.machine;
  const observer = { machine, image: p.state.card, invalidate() {} }; p.state.observer = observer;
  await assert.rejects(p.context.powerOn(), /refresh failed/);
  assert.equal(p.state.machine, machine); assert.equal(p.state.observer, observer);
});

test('mismatched observers cannot inspect steps or render another machine image error', () => {
  for (const mismatch of ['machine', 'image']) {
    let observed = 0;
    const p = pageHarness(card()); const machine = p.state.machine;
    p.state.observer = { machine: mismatch === 'machine' ? {} : machine,
      image: mismatch === 'image' ? new Uint8Array(1) : p.state.card,
      beforeStep: () => { observed++; }, afterStep: () => { observed++; }, invalidate() {},
      status: () => ({ supported: true, error: true, resolvedPending: true, sample: { count: 0 }, current: true }) };
    machine.step = () => { machine.cycles += 4; p.state.machineGeneration++; };
    p.context.frame(10);
    assert.equal(observed, 0); assert.equal(p.elements.gueststatus.textContent, 'Guest cache: state unavailable');
  }
});
