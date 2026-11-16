// Guest calls and declared device faults exercise observer failure lifetimes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseContainer, findVolume, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { fixture, sha, s, puritySnapshot, ordinaryInput, nestedLayoutCard } from './lib/guest-probe.mjs';
import { failureProgram, metadataProgram, nestedProgram, customInputProgram, queueOf, refuseWrites } from './lib/guest-errors.mjs';
const physical = (f, name) => f.m.cpu.hardware.memory[s[name]];
const word = (f, at) => f.m.cpu.hardware.memory[at] | f.m.cpu.hardware.memory[at + 1] << 8;
const volume = f => { const v = findVolume(parseContainer(f.image), 'A'); return new CpmVolume(volumePayload(f.image, v), v.g); };
const consoleText = f => Buffer.from(f.m.serial).toString('latin1');
function phase(f, name, extra = {}) {
  let queue, queueError = null;
  try { queue = queueOf(f).map(q => ({ id: q.id, block: q.block, bytes: Buffer.from(q.payload).toString('hex') })); }
  catch (error) { queueError = error.message; queue = null; }
  console.log(JSON.stringify({ phase: name, pc: f.m.pc, sp: f.m.cpu.cpu.sp, cycles: f.m.cycles, latch: f.m.sysCtrl,
    depth: physical(f, 'HKDEP'), busy: physical(f, 'HKBUSY'), errorMode: physical(f, 'ERRMODE'), cacheError: physical(f, 'HKERR'), cacheCount: physical(f, 'HKCNT'),
    queue, queueError, rawQueueBytes: Array.from(f.m.cpu.hardware.memory.subarray(s.HKQ, s.HKQ + 30)),
    rawDirtyBytes: Array.from(f.m.banks[0].subarray(s.CDIRTY - 0x8000, s.CDIRTY - 0x8000 + 30)),
    code: f.fixtureProgram ? sha(f.fixtureProgram.bytes) : null,
    card: sha(f.image), status: f.observer.status(), ordinaryInput: ordinaryInput(f), ...extra }));
}
function caseTest(name, body) {
  test(name, async () => {
    let active;
    try { await body(f => { active = f; }); }
    finally {
      if (active) {
        try { phase(active, 'final: ' + name, { observations: active.observations, purityChecks: active.purityChecks,
          consoleBytes: active.m.serial, biosOutputBytes: active.m.output,
          workerSamples: active.workerSamples, workerDeepest: s.HKSTKT - active.workerLowest,
          callbackEntries: active.callbackEntries, nestedEntries: active.nestedEntries,
          fixture: active.fixtureProgram ? { sha256: sha(active.fixtureProgram.bytes),
            bytesHex: Buffer.from(active.fixtureProgram.bytes).toString('hex'),
            labels: Object.fromEntries(Object.entries(active.fixtureProgram).filter(([name]) => name !== 'bytes')) } : null,
          writeAttempts: (active.writeAttempts ?? []).map(a => ({ block: a.block, refused: a.refused,
            payloadHex: Buffer.from(a.payload).toString('hex'), payloadSha256: sha(a.payload) })) }); }
        catch (error) { console.error(JSON.stringify({ phase: 'final diagnostic failure', case: name, error: error.message })); }
      }
    }
  });
}
function at(f, pc, label) { f.run(() => f.m.pc === pc, label); phase(f, label); }
function current(f, pc, count = null) {
  const value = f.observer.status(); assert.equal(value.current, true);
  assert.equal(value.sample.pc, pc); assert.equal(value.sample.cycles, f.m.cycles);
  if (count !== null) assert.equal(value.sample.count, count);
  return value;
}
function payload(records) { const bytes = new Uint8Array(512); bytes.fill(0x5a, 0, records * 128); return bytes; }
function queuedRecord(f, p, records = 1) {
  assert.equal(f.m.cpu.cpu.a, 0); assert.equal(f.m.cpu.hardware.memory[p.fcb + 32], records);
  const fs = volume(f), v = findVolume(parseContainer(f.image), 'A');
  const allocation = f.m.cpu.hardware.memory[p.fcb + 16] | (fs.wide ? f.m.cpu.hardware.memory[p.fcb + 17] << 8 : 0);
  assert.ok(allocation > 0 && allocation <= fs.d.dsm);
  const block = v.start + allocation * fs.blockBytes / 512;
  const entry = queueOf(f).find(entry => entry.block === block); assert.ok(entry);
  assert.deepEqual(entry.payload, payload(records)); return entry;
}
function normalInput(f) {
  const start = f.steps;
  f.run(() => f.steps > start && ordinaryInput(f) !== null, 'explicit warm/reset to a new owned ordinary command input');
  const owner = ordinaryInput(f); phase(f, 'new owned ordinary input', { owner });
  assert.ok(owner); assert.equal(current(f, f.m.pc).sample.kind, 'default input'); return owner;
}
function predictedCard(original, entry, records = 1) { const predicted = original.slice(); predicted.set(payload(records), entry.block * 512); return predicted; }

async function failedData(p, options, register) {
  const f = await fixture({ fixtureProgram: p, measureStack: !!options.measureStack, board: options.board ?? 'serial' }); register(f);
  assert.equal(ordinaryInput(f)?.route, 'serial', 'the declared command action uses the actual initial serial route');
  f.m.enqueueInput('OBSPROBE\r', 'serial'); at(f, p.afterWrite, 'genuine first WRITE acknowledgement');
  const entry = queuedRecord(f, p); current(f, p.afterWrite, 1);
  const oldCard = f.image.slice(), serialMark = f.m.serial.length, outputMark = f.m.output.length; let refusing = true;
  const attempts = refuseWrites(f, (block, bytes) => {
    assert.equal(block, entry.block, 'only the already acknowledged data block is attempted');
    assert.ok(Buffer.compare(bytes, payload(1)) === 0 || Buffer.compare(bytes, payload(2)) === 0);
    return refusing;
  });
  at(f, p.afterSilent, 'silent failed maintenance return');
  assert.equal(physical(f, 'ERRMODE'), 255); assert.equal(physical(f, 'HKERR'), 1);
  assert.deepEqual(queueOf(f)[0].payload, payload(1)); assert.deepEqual(f.image, oldCard);
  assert.deepEqual(f.m.serial.slice(serialMark), []); assert.deepEqual(f.m.output.slice(outputMark), []);
  assert.ok(attempts.length > 0 && attempts.every(a => a.refused));
  assert.equal(current(f, p.afterSilent, 1).error, true); assert.equal(f.observer.status().resolvedPending, false);
  assert.ok(f.observations.some(row => row.kind === 'after write report' && row.error === 1 && row.observedError));
  phase(f, 'verified silent refusal', { attempts: attempts.map(a => ({ block: a.block, refused: a.refused, bytes: Buffer.from(a.payload).toString('hex') })) });
  return { f, entry, oldCard, attempts, allow: () => { refusing = false; }, refuse: () => { refusing = true; } };
}

caseTest('actual silent refusal, reported pending and successful retry preserve full bytes and error lifetime', async register => {
  const p = failureProgram(), { f, entry, oldCard, allow } = await failedData(p, {}, register);
  const mark = consoleText(f).length; at(f, p.afterPending, 'non-silent pending report');
  assert.equal(physical(f, 'HKERR'), 2); assert.equal(current(f, p.afterPending, 1).error, true);
  assert.equal(consoleText(f).slice(mark).match(/Write pending/g)?.length, 1);
  allow(); at(f, p.afterRecovery, 'proved successful retry and reporter return');
  assert.equal(physical(f, 'HKERR'), 0); const status = current(f, p.afterRecovery, 0);
  assert.equal(status.error, false); assert.equal(status.resolvedPending, true);
  assert.deepEqual(f.image, predictedCard(oldCard, entry));
  assert.equal(volume(f).find('OBSPEND.DAT').records, 0);
  assert.equal(consoleText(f).slice(mark).match(/Cache clear/g)?.length, 1);
  assert.ok(f.observations.some(row => row.kind === 'before write report' && row.error === 2 && row.count === 0));
  const before = puritySnapshot(f.m); f.observer.status(); assert.deepEqual(puritySnapshot(f.m), before);
});

caseTest('actual rejected metadata with ERR1 and empty queue stays ambiguous after a zero-error report', async register => {
  const p = metadataProgram(), f = await fixture({ fixtureProgram: p }); register(f);
  const fs = volume(f), v = findVolume(parseContainer(f.image), 'A');
  const directory = new Set(Array.from({ length: v.g.dirBlocks * fs.blockBytes / 512 }, (_, i) => v.start + i));
  const original = f.image.slice(), attempts = refuseWrites(f, block => directory.has(block));
  f.m.enqueueInput('OBSPROBE\r', 'serial'); at(f, p.afterMake, 'returned refused MAKE');
  assert.equal(f.m.cpu.cpu.a, 255); assert.equal(physical(f, 'HKERR'), 1); assert.equal(physical(f, 'HKCNT'), 0);
  assert.equal(volume(f).find('OBSPEND.DAT'), undefined); assert.deepEqual(f.image, original);
  assert.equal(current(f, p.afterMake, 0).ambiguousError, true);
  const mark = consoleText(f).length; at(f, p.afterReport, 'non-silent rejected-metadata report');
  assert.equal(physical(f, 'HKERR'), 0); assert.equal(current(f, p.afterReport, 0).error, true);
  assert.equal(f.observer.status().resolvedPending, false); assert.deepEqual(f.image, original);
  assert.ok(attempts.length > 0 && attempts.every(a => a.refused));
  assert.match(consoleText(f).slice(mark), /Write error/); assert.doesNotMatch(consoleText(f).slice(mark), /Cache clear/);
});

caseTest('actual warm escape retains the error episode; explicit host reset starts a new observation epoch', async register => {
  const p = failureProgram({ warm: true }), { f, entry, oldCard } = await failedData(p, {}, register);
  const epoch = f.observer.epoch; normalInput(f);
  assert.equal(f.observer.epoch, epoch); assert.equal(f.observer.status().error, true);
  const retained = queueOf(f); assert.equal(retained.length, 1); assert.equal(retained[0].id, entry.id);
  assert.equal(retained[0].block, entry.block); assert.deepEqual(retained[0].payload, payload(1));
  current(f, f.m.pc, 1); assert.deepEqual(f.image, oldCard);
  f.observer.reset(); f.m.reset(); normalInput(f);
  assert.equal(f.observer.epoch, epoch + 1); assert.equal(f.observer.status().error, false); assert.equal(physical(f, 'HKCNT'), 0); assert.deepEqual(queueOf(f), []);
  assert.deepEqual(f.image, oldCard);
});

caseTest('actual hardware selection retains outer return ownership through its nested BDOS operation', async register => {
  const image = new Uint8Array(readFileSync(new URL('../tec-os/dist/starter.img', import.meta.url)));
  const games = parseContainer(image).volumes.find(v => v.label === 'GAMES'); assert.ok(games);
  const p = nestedProgram(games.index), f = await fixture({ fixtureProgram: p, measureStack: true, cardTransform: nestedLayoutCard }); register(f);
  assert.equal(f.m.cpu.hardware.memory[s.DRVIDX + 2], 0); assert.equal(f.m.cpu.hardware.memory[s.DRVIDX + 3], 0);
  f.m.enqueueInput('OBSPROBE\r', 'serial'); at(f, p.afterWrite, 'guest write before nested hardware call');
  const entry = queuedRecord(f, p), original = f.image.slice(), mark = f.observations.length; f.resetTracking();
  at(f, p.afterNested, 'nested hardware selection actual return');
  assert.equal(f.m.cpu.cpu.a, 0); assert.equal(current(f, p.afterNested, 0).sample.kind, 'hardware or BIOS return');
  assert.equal(f.m.cpu.hardware.memory[s.DRVIDX + 3], games.index + 1);
  assert.ok(f.nestedEntries.some(row => row.fn === 37 && row.depth === 1 && !row.busy && row.apiReturn === p.afterNested));
  assert.ok(f.nestedEntries.some(row => row.fn === 25 && row.depth === 1 && !row.busy && row.apiReturn === p.afterNested));
  assert.ok(f.maxDepth >= 2); assert.equal(f.observations.slice(mark).filter(row => row.kind === 'BDOS return').length, 0);
  assert.deepEqual(f.image, predictedCard(original, entry));
});

caseTest('actual status-only and custom-hook waits cannot become default-input observations', async register => {
  const p = customInputProgram(), f = await fixture({ fixtureProgram: p }); register(f);
  f.m.enqueueInput('OBSPROBE\r', 'serial'); at(f, p.beforeStatus, 'actual status caller entry'); const mark = f.observations.length;
  at(f, s.CSTPOLL, 'actual status poll before input'); assert.equal(f.observer.status().current, false);
  at(f, p.afterStatus, 'actual status return'); current(f, p.afterStatus);
  at(f, p.afterInstall, 'guest custom BIOS input hook installation'); assert.equal(word(f, s.RAMBIOS + 10), p.hook);
  at(f, s.CINLP, 'custom hook actual default-console wait without a key');
  assert.equal(f.observer.status().current, false);
  assert.equal(f.observations.slice(mark).filter(row => row.kind === 'default input').length, 0);
});

for (const callback of ['write-error', 'escape']) caseTest(`actual UC1 reporter callback ${callback} cannot erase or fabricate guest facts`, async register => {
  const p = failureProgram({ callback }), { f, entry, oldCard, allow, refuse } = await failedData(p, { measureStack: true, board: 'uc1' }, register);
  at(f, p.afterPending, 'pending notice before UC1 installation');
  at(f, p.afterInstall, 'public UC1 driver installation'); assert.equal(f.m.cpu.cpu.a, 0); assert.equal(word(f, s.GLVEC), p.table);
  at(f, p.afterDriver, 'ordinary output activates UC1 without an armed callback'); assert.equal(physical(f, 'CONMOD'), 3);
  assert.equal(word(f, s.VPUTV), p.hook); assert.equal(f.m.cpu.hardware.memory[p.callbackCount], 0);
  at(f, p.beforeRecovery, 'guest arms the one-shot UC1 callback');
  assert.equal(f.m.cpu.hardware.memory[p.once], 1); f.resetTracking();
  const guard = f.m.cpu.hardware.memory.slice(s.HKGRD, s.HKGRD + 2); allow();
  f.run(() => f.m.pc === s.HKNCLR && (f.m.cpu.cpu.h << 8 | f.m.cpu.cpu.l) === s.HKOKMSG && physical(f, 'HKERR') === 2 && physical(f, 'HKCNT') === 0, 'actual pending-resolution branch before callback');
  phase(f, 'old pending resolution before callback'); const mark = f.observations.length;
  if (callback === 'write-error') {
    refuse(); at(f, p.callbackWriteReturned, 'callback second WRITE returns before close');
    assert.equal(f.m.cpu.cpu.a, 0); assert.equal(f.m.cpu.hardware.memory[p.fcb + 32], 2);
    assert.equal(physical(f, 'HKBUSY'), 1); assert.equal(physical(f, 'HKDEP'), 1);
    const second = queueOf(f); assert.equal(second.length, 1); assert.equal(second[0].block, entry.block); assert.deepEqual(second[0].payload, payload(2));
    assert.deepEqual(f.image, predictedCard(oldCard, entry));
    at(f, p.afterRecovery, 'normal reporter return with newly failed callback data');
    assert.equal(f.m.cpu.hardware.memory[p.fcb + 32], 2); assert.equal(f.m.cpu.hardware.memory[p.callbackStatus], 255);
    assert.deepEqual(queueOf(f).find(q => q.block === entry.block).payload, payload(2));
    assert.deepEqual(f.image, predictedCard(oldCard, entry));
    assert.equal(physical(f, 'HKERR'), 1); assert.equal(current(f, p.afterRecovery, 1).error, true);
    assert.equal(f.observer.status().resolvedPending, false);
  } else {
    normalInput(f); assert.equal(physical(f, 'HKCNT'), 0); assert.equal(physical(f, 'HKERR'), 0);
    assert.equal(f.observer.status().error, true); assert.equal(f.observer.status().resolvedPending, false);
    assert.equal(f.observations.slice(mark).filter(row => row.kind === 'after write report').length, 0);
    assert.deepEqual(f.image, predictedCard(oldCard, entry));
  }
  assert.equal(f.m.cpu.hardware.memory[p.callbackCount], 1); assert.ok(f.callbackEntries > 0); assert.ok(f.workerSamples > 0);
  assert.ok(f.workerLowest >= s.HKSTKB); assert.deepEqual(f.m.cpu.hardware.memory.slice(s.HKGRD, s.HKGRD + 2), guard);
});
