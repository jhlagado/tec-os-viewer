// Exercise transactional imports, request-order lifecycle and live selection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createContainer, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { pageHarness, pageSource, gate, tick } from './lib/lifecycle-page.mjs';
const card = () => createContainer([{ geometry: 'G1M', label: 'SYSTEM', mount: 'A' }]);
const fs = image => { const v = parseContainer(image).volumes[0]; return new CpmVolume(volumePayload(image, v), v.g); };
const file = (name, size = 128) => ({ name, arrayBuffer: async () => new ArrayBuffer(size) });
const event = files => ({ target: { files, value: 'selected' } });

test('browser stages the whole import before saving or publishing', async () => {
  const image = card(), before = image.slice(), p = pageHarness(image);
  await p.handlers.putfile(event([file('GOOD.TXT'), file('HUGE.DAT', 2 * 1024 * 1024)]));
  assert.equal(p.state.card, image); assert.deepEqual(image, before);
  assert.equal(p.writes.length, 0); assert.equal(p.state.machine.resets ?? 0, 0);
  await p.handlers.putfile(event([file('GOOD.TXT')]));
  assert.equal(p.state.card, image); assert.ok(fs(image).find('GOOD.TXT'));
  assert.equal(p.writes.length, 1); assert.equal(p.state.machine.resets, 1);
});

for (const running of [true, false]) for (const failure of [null, 'read', 'save']) {
  test(`browser import preserves running intent=${running} after ${failure ?? 'success'}`, async () => {
    const image = card(), before = image.slice(), read = gate(), save = gate(); let saves = 0;
    const p = pageHarness(image, { state: { running }, saveCard: async () => {
      saves++; assert.ok(p.state.lifecyclePending); assert.equal(p.state.machine, null);
      await save.promise; if (failure === 'save') throw Error('save failed');
    } });
    const machine = p.state.machine;
    const pending = p.handlers.putfile(event([{ name: 'KEEP.TXT', arrayBuffer: async () => {
      assert.ok(p.state.lifecyclePending); await read.promise;
      if (failure === 'read') throw Error('read failed'); return new ArrayBuffer(128);
    } }]));
    await tick(); assert.ok(p.state.lifecyclePending); assert.equal(p.state.running, running);
    read.release(); await tick();
    if (failure !== 'read') { assert.equal(saves, 1); assert.deepEqual(image, before); }
    save.release(); await pending;
    assert.equal(p.state.lifecyclePending, 0); assert.equal(p.state.running, running);
    assert.equal(p.state.machine, machine); assert.equal(machine.resets ?? 0, failure ? 0 : 1);
    if (failure) assert.deepEqual(image, before);
  });
}

for (const running of [true, false]) for (const failure of [false, true]) {
  test(`browser import serializes competing requests, running=${running}, failure=${failure}`, async () => {
    const image = card(), before = image.slice(), read = gate(), save = gate(); let secondReads = 0, writes = 0;
    const p = pageHarness(image, { state: { running }, saveCard: async () => {
      writes++; await save.promise; if (failure) throw Error('save failed');
    } });
    const first = p.handlers.putfile(event([{ name: 'FIRST.TXT', arrayBuffer: async () => { await read.promise; return new ArrayBuffer(128); } }]));
    const second = p.handlers.putfile(event([{ name: 'SECOND.TXT', arrayBuffer: async () => { secondReads++; return new ArrayBuffer(128); } }]));
    const power = p.handlers.power();
    await tick(); assert.ok(p.state.lifecyclePending); assert.equal(secondReads, 0);
    p.handlers.pause(); assert.equal(p.state.running, !running);
    const auto = p.persistence.autosave(); await tick();
    read.release(); await tick(); assert.equal(secondReads, 0); assert.deepEqual(image, before);
    save.release(); await Promise.all([first, second, power, auto]);
    assert.equal(secondReads, 1); assert.equal(p.state.running, !running); assert.equal(p.state.lifecyclePending, 0);
    if (failure) assert.deepEqual(image, before);
    else { assert.ok(fs(image).find('FIRST.TXT')); assert.ok(fs(image).find('SECOND.TXT')); }
    assert.equal(writes, 2);
  });
}

test("a width chosen while an import's files are read is applied after the captured import turn", async () => {
  const image = card(), read = gate(), prepared = [], stored = [];
  const p = pageHarness(image, {
    state: { width: '80' },
    saveCard: async bytes => stored.push(bytes.slice()),
    prepareCard: (bytes, _display, width) => {
      prepared.push(width); fs(bytes).write('WIDTH.TXT', new TextEncoder().encode(width)); return { changed: true };
    },
  });
  await p.context.powerOn();
  const imported = p.handlers.putfile(event([{ name: 'NEW.TXT', arrayBuffer: async () => { await read.promise; return Uint8Array.of(65).buffer; } }]));
  await tick(); p.elements.profile.value = '40';
  const width = p.handlers.profile({ target: { value: '40' } });
  await tick(); assert.deepEqual(prepared, ['80']);
  read.release(); await imported;
  assert.ok(fs(image).find('NEW.TXT'));
  assert.equal(new TextDecoder().decode(fs(stored[0]).read('WIDTH.TXT')).replace(/\0+$/, ''), '80', 'import commits before later width preparation');
  await width;
  assert.ok(fs(image).find('NEW.TXT'));
  assert.equal(new TextDecoder().decode(fs(image).read('WIDTH.TXT')).replace(/\0+$/, ''), '40');
  assert.deepEqual(prepared, ['80', '40']);
  assert.equal(p.persistence.status().saved, false, 'later preparation is a new pending card revision');
});

test('drive metadata does not publish the intermediate zero during a remount', () => {
  const at = pageSource.indexOf('function liveDrives('), context = {};
  runInNewContext(pageSource.slice(at, pageSource.indexOf('\n}\n', at) + 3), context);
  let waiting = true; const selected = [1, 2, 3, 0];
  const m = { symbols: new Map([['DRVIDX', 100], ['STPOS', 10]]), sysCtrl: 0,
    waitingForInput: () => waiting, read: address => address === 10 ? 0x80 : selected[address - 100] };
  assert.deepEqual(Array.from(context.liveDrives(m)), [1, 2, 3, 0]);
  waiting = false; selected[0] = 0; assert.equal(context.liveDrives(m), null);
  selected[0] = 4; assert.equal(context.liveDrives(m), null);
  waiting = true; assert.deepEqual(Array.from(context.liveDrives(m)), [4, 2, 3, 0]);
});

test('an unavailable live import target refuses without reading files or changing bytes', async () => {
  const image = card(), before = image.slice(), p = pageHarness(image); let reads = 0;
  p.state.drives = [1, 0, 0, 0];
  p.state.machine.waitingForInput = () => false;
  await p.handlers.putfile(event([{ name: 'NO.TXT', arrayBuffer: async () => { reads++; return new ArrayBuffer(1); } }]));
  assert.equal(reads, 0); assert.equal(p.writes.length, 0); assert.deepEqual(image, before);
  assert.match(p.elements.cardproblem.textContent, /live drive selection is unavailable/);
});

test('Copy availability follows fresh input, volume, drive and lifecycle state even while paused', async () => {
  const p = pageHarness(card(), { state: { running: false } });
  let waiting = true, selected = 1;
  const machine = p.state.machine;
  machine.waitingForInput = () => waiting;
  machine.read = at => at === 10 ? 0x80 : at === 100 ? selected : 0;
  p.state.drives = [1, 0, 0, 0];
  p.context.$('cardproblem').textContent = 'Earlier file error';
  p.context.frame(10);
  assert.equal(p.elements.putfile.disabled, false);
  assert.match(p.elements.copyavailability.textContent, /^Copy available/);
  waiting = false; selected = 0;
  p.context.frame(20);
  assert.equal(p.elements.putfile.disabled, true, 'cached mapping cannot authorize a transient remount');
  waiting = true; selected = 2;
  p.context.frame(30);
  assert.equal(p.elements.putfile.disabled, true, 'a descriptor beyond the card is unavailable');
  selected = 1;
  p.elements.drive.value = 'B'; p.handlers.drive();
  assert.equal(p.elements.putfile.disabled, true);
  p.elements.drive.value = 'A'; p.handlers.drive();
  assert.equal(p.elements.putfile.disabled, false);
  const held = gate(), pending = p.context.lifecycle(() => held.promise);
  assert.equal(p.elements.putfile.disabled, true, 'admission disables synchronously');
  assert.match(p.elements.copyavailability.textContent, /card operation/);
  held.release(); await pending;
  assert.equal(p.elements.putfile.disabled, false, 'completion refreshes without another guest step');
  assert.equal(p.state.running, false);
  assert.equal(p.elements.cardproblem.textContent, 'Earlier file error');
  p.state.machine = null;
  p.context.frame(40);
  assert.equal(p.elements.putfile.disabled, true);
});
