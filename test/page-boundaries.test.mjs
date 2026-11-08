// Check imports and width changes using
// the actual page handlers
// (KE-163, KE-168).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createContainer, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';

function card() {
  const image = createContainer([{ geometry: 'G1M', label: 'SYSTEM', mount: 'A' }]);
  const v = parseContainer(image).volumes[0];
  return { image, fs: new CpmVolume(volumePayload(image, v), v.g) };
}

/** Extract the named page function. */
function fn(source, name) {
  const at = source.indexOf(name);
  return source.slice(at, source.indexOf("\n}\n", at) + 3);
}

/**
 * Include importSave and serial before
 * the requested page-source slice
 * (KE-163, KE-168).
 */
function withImportSave(source, start, end) {
  const serial = source.includes("function serial(") ? `let turn = Promise.resolve();\n${fn(source, "function serial(")}` : "";
  return `${fn(source, "async function importSave")}\n${serial}\n${source.slice(start, end)}`;
}


test('browser stages the whole import before saving or publishing', async () => {
  const { image } = card();
  const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('$("putfile").addEventListener');
  const end = source.indexOf('$("drive").addEventListener', start);
  const state = { card: image };
  const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, fn) => { handler = fn; } } };
  let handler, saves = 0, resets = 0;
  const context = { state, CpmVolume, parseContainer, volumePayload, $: id => elements[id], saveCard: async () => { saves++; }, reset: () => { resets++; }, refreshFiles: () => {} };
  context.currentVolume = () => {
    const v = parseContainer(state.card).volumes[0];
    return new CpmVolume(volumePayload(state.card, v), v.g);
  };
  runInNewContext(withImportSave(source, start, end), context);
  const before = image.slice();
  const file = (name, size) => ({ name, arrayBuffer: async () => new ArrayBuffer(size) });
  await handler({ target: { files: [file('GOOD.TXT', 128), file('HUGE.DAT', 2 * 1024 * 1024)] } });
  assert.equal(state.card, image);
  assert.equal(Buffer.compare(state.card, before), 0);
  assert.equal(saves, 0);
  assert.equal(resets, 0);
  await handler({ target: { files: [file('GOOD.TXT', 128)] } });
  assert.equal(state.card, image);
  assert.ok(context.currentVolume().find('GOOD.TXT'));
  assert.equal(saves, 1);
  assert.equal(resets, 1);
});

for (const running of [true, false]) {
  for (const failure of [null, 'read', 'save']) {
    test(`browser import restores running=${running} after ${failure ?? 'success'}`, async () => {
      const { image } = card();
      const before = image.slice();
      const state = { card: image, running };
      const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
      const start = source.indexOf('$("putfile").addEventListener');
      const end = source.indexOf('$("drive").addEventListener', start);
      let handler, releaseRead, releaseSave, saves = 0, resets = 0;
      const readGate = new Promise(resolve => { releaseRead = resolve; });
      const saveGate = new Promise(resolve => { releaseSave = resolve; });
      const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, fn) => { handler = fn; } } };
      runInNewContext(withImportSave(source, start, end), {
        state, CpmVolume, parseContainer, volumePayload, $: id => elements[id],
        currentVolume: () => new CpmVolume(volumePayload(image, parseContainer(image).volumes[0]), parseContainer(image).volumes[0].g),
        saveCard: async () => {
          saves++;
          assert.equal(state.running, false);
          await saveGate;
          assert.equal(state.running, false);
          if (failure === 'save') throw Error('save failed');
        },
        reset: () => { assert.equal(state.running, false); resets++; },
        refreshFiles: () => {},
      });
      const pending = handler({ target: { files: [{ name: 'KEEP.TXT', arrayBuffer: async () => {
        assert.equal(state.running, false);
        await readGate;
        assert.equal(state.running, false);
        if (failure === 'read') throw Error('read failed');
        return new ArrayBuffer(128);
      } }] } });
      const pausedDuringRead = state.running;
      releaseRead();
      // Advance to the blocked save.
      await new Promise(resolve => setImmediate(resolve));
      if (failure !== 'read') {
        assert.equal(saves, 1);
        assert.equal(state.running, false);
        assert.equal(Buffer.compare(image, before), 0);
      }
      releaseSave();
      await pending;
      assert.equal(pausedDuringRead, false);
      assert.equal(state.importBusy, false);
      assert.equal(state.running, running);
      assert.equal(resets, failure ? 0 : 1);
      if (failure) assert.equal(Buffer.compare(image, before), 0);
    });
  }
}

for (const running of [true, false]) {
  for (const failure of [false, true]) {
    test(`browser import guard excludes competing operations, running=${running}, failure=${failure}`, async () => {
      const { image, fs } = card();
      const before = image.slice();
      const state = { card: image, running, cardDirty: true };
      const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
      const handlers = {};
      const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {} };
      const $ = id => elements[id] ??= { addEventListener: (_type, fn) => { handlers[id] = fn; } };
      let releaseRead, releaseSave, saves = 0, powers = 0, steps = 0, autosave;
      const readGate = new Promise(resolve => { releaseRead = resolve; });
      const saveGate = new Promise(resolve => { releaseSave = resolve; });
      const context = { state, $, CpmVolume, parseContainer, volumePayload,
        currentVolume: () => fs,
        saveCard: async () => { saves++; await saveGate; if (failure) throw Error('save failed'); },
        reset: () => {}, refreshFiles: () => {}, refreshCard: () => {}, powerOn: async () => { powers++; },
        setInterval: fn => { autosave = fn; }, performance: { now: () => 0 }, CPU_HZ: 1000,
        requestAnimationFrame: () => {}, render: () => {},
      };
      const importStart = source.indexOf('$("putfile").addEventListener');
      const pauseStart = source.indexOf('$("pause").addEventListener');
      const useStart = source.indexOf('async function useCard(');
      const autosaveStart = source.indexOf('setInterval(async () =>');
      runInNewContext([
        withImportSave(source, importStart, source.indexOf('$("drive").addEventListener', importStart)),
        source.slice(pauseStart, source.indexOf('setInterval(refreshFiles', pauseStart)),
        source.slice(useStart, source.indexOf('$("starter").addEventListener', useStart)),
        source.slice(autosaveStart, source.indexOf('// ---- Run loop', autosaveStart)),
        source.slice(source.indexOf('let last ='), source.indexOf('// ---- Rendering')),
        'this.useCard = useCard; this.frame = frame;',
      ].join('\n'), context);
      state.machine = { cycles: 0, step() { steps++; this.cycles++; } };
      const pending = handlers.putfile({ target: { files: [{ name: 'FIRST.TXT', arrayBuffer: async () => { await readGate; return new ArrayBuffer(128); } }] } });
      const busyDuringRead = state.importBusy;
      let secondReads = 0;
      const overlapping = handlers.putfile({ target: { files: [{ name: 'SECOND.TXT', arrayBuffer: async () => { secondReads++; return new ArrayBuffer(128); } }] } });
      const busyAfterOverlap = state.importBusy;
      handlers.pause();
      const runningAfterPause = state.running;
      const replacement = context.useCard(card().image);
      const cardAfterReplacement = state.card;
      const powersAfterReplacement = powers;
      const autosaveRead = autosave();
      const savesDuringRead = saves;
      const dirtyDuringRead = state.cardDirty;
      // Block machine stepping during imports,
      // even if a control sets running.
      state.running = true;
      context.frame(10);
      const stepsDuringRead = steps;
      state.running = false;
      releaseRead();
      await new Promise(resolve => setImmediate(resolve));
      const busyDuringSave = state.importBusy;
      handlers.pause();
      const runningDuringSave = state.running;
      const autosaveSave = autosave();
      const savesDuringSave = saves;
      releaseSave();
      await Promise.all([pending, overlapping, replacement, autosaveRead, autosaveSave].map(p => Promise.resolve(p).catch(() => {})));
      assert.equal(busyDuringRead, true);
      assert.equal(busyAfterOverlap, true);
      assert.equal(secondReads, 0);
      assert.equal(runningAfterPause, false);
      assert.equal(cardAfterReplacement, image);
      assert.equal(powersAfterReplacement, 0);
      assert.equal(savesDuringRead, 0);
      assert.equal(dirtyDuringRead, true);
      assert.equal(stepsDuringRead, 0);
      assert.equal(busyDuringSave, true);
      assert.equal(runningDuringSave, false);
      assert.equal(savesDuringSave, 1);
      assert.equal(state.importBusy, false);
      assert.equal(state.running, running);
      assert.equal(state.card, image);
      assert.equal(fs.find('SECOND.TXT'), undefined);
      if (failure) assert.equal(Buffer.compare(image, before), 0);
      else assert.ok(fs.find('FIRST.TXT'));
    });
  }
}

test("a width chosen while an import's files are read is the width on the card the import publishes (KE-168)", async () => {
  const { image } = card();
  const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  const life = source.slice(source.indexOf("let turn = Promise.resolve();"), source.indexOf("\nfunction reset()"));
  const start = source.indexOf('$("putfile").addEventListener');
  const end = source.indexOf('$("drive").addEventListener', start);
  const state = { card: image, display: 'tms', width: '80' };
  const elements = { drive: { value: 'A' }, astext: { checked: false }, cardinfo: {}, putfile: { addEventListener: (_type, f) => { handler = f; } } };
  let handler, releaseRead;
  const readGate = new Promise((ok) => { releaseRead = ok; });
  const volumeOf = (img) => { const v = parseContainer(img).volumes[0]; return new CpmVolume(volumePayload(img, v), v.g); };
  const context = {
    state, CpmVolume, parseContainer, volumePayload, $: (id) => elements[id],
    saveCard: async () => {}, reset: () => {}, refreshFiles: () => {}, appendSerial: () => {},
    fetch: async () => ({ json: async () => ({}) }), fetchBytes: async () => new Uint8Array(0),
    loadRom: async () => ({ rom: new Uint8Array(0), symbols: new Map() }),
    Machine: class {},
    // Record the prepared width on A:
    // instead of configuring a driver.
    prepareCard: (img, _display, width) => { volumeOf(img).write('WIDTH.TXT', new TextEncoder().encode(width)); return { problem: null, note: null, changed: true }; },
  };
  const page = source.includes("let turn = Promise.resolve();")
    ? `${life}\n${fn(source, "async function importSave")}\n${source.slice(start, end)}\nthis.powerOn = powerOn;`
    : `${source.slice(source.indexOf("async function powerOn"), source.indexOf("\nfunction reset()"))}\n${withImportSave(source, start, end)}\nthis.powerOn = powerOn;`;
  runInNewContext(page, context);
  await context.powerOn(); // Begin at 80 columns.
  const imported = handler({ target: { files: [{ name: 'new.txt', arrayBuffer: async () => { await readGate; return new Uint8Array([65]).buffer; } }], value: 'x' } });
  await new Promise((ok) => setTimeout(ok, 0));
  state.width = '40'; // Change width while file input waits.
  await context.powerOn();
  releaseRead();
  await imported;
  const a = volumeOf(state.card);
  assert.ok(a.find('NEW.TXT'), 'the import published');
  assert.equal(new TextDecoder().decode(a.read('WIDTH.TXT')).replace(/\0+$/, ''), '40', 'and the card holds the width chosen last');
});
