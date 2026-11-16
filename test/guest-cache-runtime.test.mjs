// Actual pinned CPU traces; the helper owns setup and normal stepping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { parseContainer, findVolume, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { sha, s, program, puritySnapshot, fixture } from './lib/guest-probe.mjs';

for (const board of ['serial', 'matrix']) test(`actual ${board} cold boot reaches a witnessed default input without observer mutation`, async () => {
  const f = await fixture({ board });
  assert.equal(f.observer.initialized, true); assert.equal(f.observer.status().current, true); assert.equal(f.observer.status().sample.kind, 'default input'); assert.equal(f.observer.status().sample.count, 0);
  assert.ok(f.purityChecks > 0, 'the actual selected after-hook purity checks ran');
  const before = puritySnapshot(f.m);
  f.observer.status(); f.observer.beforeStep();
  assert.deepEqual(puritySnapshot(f.m), before);
  console.log(JSON.stringify({ case: `boot-${board}`, cycles: f.m.cycles, sample: f.observer.status().sample, card: sha(f.image), purityScope: 'full physical/CPU/SD/card clones around each selected afterStep during trace, plus final beforeStep/status check', actualAfterHookPurityChecks: f.purityChecks }));
});

test('actual guest F21 ACK is observed before compute; a card-byte snapshot cannot drain the paused cache', async () => {
  const p = program(), f = await fixture({ fixtureProgram: p });
  f.m.enqueueInput('OBSPROBE\r', 'serial');
  f.run(() => f.m.pc === p.afterWrite, 'explicit guest command through F21 return');
  assert.equal(f.m.cpu.cpu.a, 0);
  const physical = f.m.cpu.hardware.memory, cache = f.m.banks[0];
  assert.equal(physical[p.fcb + 32], 1, 'actual FCB advances one accepted record');
  const v = findVolume(parseContainer(f.image), 'A'), fs = new CpmVolume(volumePayload(f.image, v), v.g);
  const allocation = physical[p.fcb + 16] | (fs.wide ? physical[p.fcb + 17] << 8 : 0);
  assert.ok(allocation > 0 && allocation <= fs.d.dsm);
  const block = v.start + allocation * fs.blockBytes / 512;
  const queued = Array.from({ length: physical[s.HKCNT] }, (_, i) => physical[s.HKQ + i]);
  const id = queued.find(line => {
    const at = s.CTAB - 0x8000 + line * 4;
    return [...cache.subarray(at, at + 4)].reduce((n, b, i) => n + b * 2 ** (i * 8), 0) === block;
  });
  assert.notEqual(id, undefined, 'the FCB-allocated first data block remains queued');
  const payload = cache.slice(id * 512, id * 512 + 512), expected = new Uint8Array(512); expected.fill(0x5a, 0, 128);
  assert.deepEqual(payload, expected, 'all512 bytes match the independently constructed record and fresh-block zero fill');
  assert.notEqual(Buffer.compare(payload, f.image.subarray(block * 512, (block + 1) * 512)), 0);
  assert.equal(f.observer.status().current, true); assert.equal(f.observer.status().sample.kind, 'BDOS return'); assert.ok(f.observer.status().sample.count > 0);
  assert.ok(f.purityChecks > 0, 'the actual selected after-hook purity checks ran');
  const before = puritySnapshot(f.m), cardCopy = f.image.slice();
  f.observer.status(); f.observer.beforeStep();
  assert.deepEqual(puritySnapshot(f.m), before); assert.deepEqual(cardCopy, f.image);
  f.step(); assert.equal(f.observer.status().current, false); assert.ok(f.observer.status().sample.count > 0);
  console.log(JSON.stringify({ case: 'F21-then-compute', code: sha(p.bytes), cycles: f.m.cycles, block, payload: sha(payload), card: sha(f.image), status: f.observer.status(), purityScope: 'full physical/CPU/SD/card clones around each selected afterStep during trace, plus final beforeStep/status check', actualAfterHookPurityChecks: f.purityChecks }));
});

test('actual public hardware and BIOS returns are observed after their installed frame returns', async () => {
  const p = program({ hardware: true, bios: true }), f = await fixture({ fixtureProgram: p });
  f.m.enqueueInput('OBSPROBE\r', 'serial');
  f.run(() => f.m.pc === p.afterWrite, 'explicit guest write');
  const start = f.observations.length;
  f.run(() => f.m.pc === p.afterHardware, 'explicit hardware INFO return');
  assert.equal(f.observer.status().current, true);
  assert.equal(f.observer.status().sample.pc, f.m.pc); assert.equal(f.observer.status().sample.cycles, f.m.cycles);
  assert.equal(f.observer.status().sample.kind, 'hardware or BIOS return');
  f.run(() => f.m.pc === p.spin, 'explicit BIOS status return');
  assert.equal(f.observer.status().current, true);
  assert.equal(f.observer.status().sample.pc, f.m.pc); assert.equal(f.observer.status().sample.cycles, f.m.cycles);
  assert.equal(f.observer.status().sample.kind, 'hardware or BIOS return');
  assert.ok(f.purityChecks > 0, 'the actual selected after-hook purity checks ran');
  const before = puritySnapshot(f.m); f.observer.status(); f.observer.beforeStep(); assert.deepEqual(puritySnapshot(f.m), before);
  console.log(JSON.stringify({ case: 'hardware-BIOS', code: sha(p.bytes), cycles: f.m.cycles, observations: f.observations.slice(start), card: sha(f.image), purityScope: 'full physical/CPU/SD/card clones around each selected afterStep during trace, plus final beforeStep/status check', actualAfterHookPurityChecks: f.purityChecks }));
});


test('same exact guest trace with observer off/on preserves all state and records finite host costs', async () => {
  const p = program({ hardware: true, bios: true });
  const started = performance.now(); const on = await fixture({ fixtureProgram: p, purity: false });
  on.m.enqueueInput('OBSPROBE\r', 'serial');
  on.run(() => on.m.pc === p.spin, 'measured observer-on public trace');
  const onWall = performance.now() - started;
  const offStarted = performance.now(); const off = await fixture({ fixtureProgram: p, observe: false, purity: false, bootSteps: on.bootSteps });
  off.m.enqueueInput('OBSPROBE\r', 'serial');
  for (let i = on.bootSteps; i < on.steps; i++) { off.m.pumpInput(); off.step(); }
  const offWall = performance.now() - offStarted;
  assert.equal(off.m.pc, p.spin); assert.equal(off.m.cycles, on.m.cycles);
  assert.deepEqual(puritySnapshot(off.m), puritySnapshot(on.m));
  assert.deepEqual(off.m.serial, on.m.serial); assert.deepEqual(off.m.output, on.m.output);
  const copies = []; let copy;
  for (let i = 0; i < 8; i++) {
    const at = performance.now(); copy = new Uint8Array(on.image); copies.push(performance.now() - at);
    assert.equal(sha(copy), sha(on.image));
  }
  console.log(JSON.stringify({ case: 'observer-off-on-and-copy', steps: on.steps, cycles: on.m.cycles,
    onWallMs: onWall, offWallMs: offWall, wallScope: 'finite whole fixture plus explicit command; no purity-clone work in timed traces',
    card: sha(on.image), copyBytes: on.image.length, copyMs: copies,
    processMemoryAfter: process.memoryUsage(), memoryScope: 'post-copy sample, not instantaneous peak or a universal browser-memory bound' }));
});
