// Synthetic transition/physical-state tests. Actual CPU traces are separate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { symbolsFromD8 } from '../tec-os/host/machine.mjs';
import { bindGuestProfile, GuestCacheObserver } from '../src/guest-cache.mjs';
import profile from '../src/guest-profile.json' with { type: 'json' };
const rom = new Uint8Array(readFileSync(new URL('../tec-os/dist/tecos.rom', import.meta.url)));
const symbols = symbolsFromD8(JSON.parse(readFileSync(new URL('../tec-os/dist/tecos.d8.json', import.meta.url))));
const s = Object.fromEntries(symbols), binding = await bindGuestProfile(rom, symbols);
function fixture() {
  const memory = new Uint8Array(0x10000); memory.set(rom, 0xc000);
  const r = { pc: 0, sp: 0x9000, a: 0, b: 0, c: 0, d: 0, e: 0, h: 0, l: 0 };
  const m = { cpu: { hardware: { memory }, cpu: r }, banks: Array.from({ length: 9 }, () => new Uint8Array(0x4000)),
    get pc() { return r.pc; }, sysCtrl: 1, physicalBank: -1, classicBankIn: true, cycles: 0 };
  const image = new Uint8Array(512 * 64);
  m.sdImage = image;
  const observer = new GuestCacheObserver(m, binding, profile.memoryProfile, image);
  const put = (name, value) => { memory[s[name]] = value; };
  const word = (at, value) => { memory[at] = value & 255; memory[at + 1] = value >> 8; };
  put('LATCHV', 1);
  const transition = (pc, nextPC, action = () => {}) => { r.pc = pc; const pre = observer.beforeStep(); action(); r.pc = nextPC; m.cycles += 4; observer.afterStep(pre); };
  const initialized = () => {
    transition(s.COLD, s.COLD + 1);
    r.h = s.WSBASE >> 8; r.l = s.WSBASE & 255; r.d = (s.WSBASE + 1) >> 8; r.e = (s.WSBASE + 1) & 255;
    r.b = s.WSSPAN >> 8; r.c = s.WSSPAN & 255;
    transition(s.COLDZ + 31, s.COLDZ + 33, () => { r.b = r.c = 0; });
    r.sp = s.STKTOP;
    transition(s.COLDRT - 3, s.MEMINIT, () => { r.sp -= 2; word(r.sp, s.COLDRT); });
    transition(s.MEMINIT + 38, s.COLDRT, () => { r.sp += 2; });
  };
  const queue = (ids = [1], blocks = [3]) => {
    put('HKCNT', ids.length); m.banks[0].fill(0, s.CDIRTY - 0x8000, s.CDIRTY - 0x8000 + 30);
    ids.forEach((id, i) => { memory[s.HKQ + i] = id; m.banks[0][s.CDIRTY - 0x8000 + id] = 1;
      const at = s.CTAB - 0x8000 + id * 4; for (let j = 0; j < 4; j++) m.banks[0][at + j] = blocks[i] >>> (8 * j) & 255; });
  };
  const returnedWrite = () => {
    r.sp = 0x7000; r.c = 21; word(r.sp, 0x2345);
    transition(s.BENTRY, s.BENTRY + 4);
    word(s.OLDSP, 0x7000); r.sp = 0x7000; r.a = 0;
    transition(s.RETWORD + 9, 0x2345, () => { r.sp += 2; });
  };
  return { m, r, observer, memory, put, word, transition, initialized, queue, returnedWrite };
}

test('full binding rejects old ROM, missing symbols and unregistered or unsupported physical profiles', async () => {
  assert.equal(binding.supported, true);
  const changed = rom.slice(); changed[0] ^= 1;
  assert.equal((await bindGuestProfile(changed, symbols)).supported, false);
  const missing = new Map(symbols); missing.delete('HKQ');
  assert.equal((await bindGuestProfile(rom, missing)).supported, false);
  const f = fixture();
  assert.equal(new GuestCacheObserver(f.m, binding, profile.memoryProfile, new Uint8Array(f.observer.image.length)).status().supported, false);
  assert.equal(new GuestCacheObserver(f.m, { ...binding }, profile.memoryProfile, f.observer.image).status().supported, false);
  assert.equal(new GuestCacheObserver(f.m, binding, { ...profile.memoryProfile, windowRam: false }, f.observer.image).status().supported, false);
});

test('only witnessed cold clear and MEMINIT return initialize; diagnostic numeric retry does not', () => {
  const f = fixture(); f.transition(s.MEMINIT + 38, s.COLDRT); assert.equal(f.observer.initialized, false);
  f.initialized(); assert.equal(f.observer.initialized, true);
});

test('a matched BDOS write return observes pending data before the next application instruction', () => {
  const f = fixture(); f.initialized(); f.queue(); f.returnedWrite();
  assert.equal(f.observer.status().sample.count, 1); assert.equal(f.observer.status().current, true);
  f.transition(0x2345, 0x2346); assert.equal(f.observer.status().current, false); assert.equal(f.observer.status().sample.count, 1);
});

test('arbitrary RET, pre-return PC or mismatched caller stack cannot certify a public return', () => {
  for (const pc of [s.RETWORD + 3, 0x2345, s.RETWORD + 9]) {
    const f = fixture(); f.initialized(); f.queue(); f.r.sp = 0x7000; f.r.c = 21; f.word(0x7000, 0x2345);
    f.transition(s.BENTRY, s.BENTRY + 4); f.word(s.OLDSP, 0x7000); f.r.sp = pc === s.RETWORD + 9 ? 0x7002 : 0x7000;
    f.transition(pc, 0x2345, () => { f.r.sp += 2; });
    assert.equal(f.observer.status().sample, null);
  }
});

for (const fault of ['duplicate ids', 'orphan dirty', 'invalid dirty', 'tag outside card', 'duplicate tags', 'count overflow', 'partial insertion']) {
  test(`malformed cache stays unknown: ${fault}`, () => {
    const f = fixture(); f.initialized(); f.queue();
    if (fault === 'duplicate ids') f.queue([1, 1], [3, 4]);
    if (fault === 'orphan dirty') f.m.banks[0][s.CDIRTY - 0x8000 + 2] = 1;
    if (fault === 'invalid dirty') f.m.banks[0][s.CDIRTY - 0x8000 + 1] = 2;
    if (fault === 'tag outside card') f.queue([1], [64]);
    if (fault === 'duplicate tags') f.queue([1, 2], [3, 3]);
    if (fault === 'count overflow') f.put('HKCNT', 31);
    if (fault === 'partial insertion') f.put('HKCNT', 0);
    f.returnedWrite(); assert.equal(f.observer.status().sample, null);
  });
}

test('stale-clean CPEND is valid and an observer never changes physical state', () => {
  const f = fixture(); f.initialized(); f.queue(); f.put('CPEND', 3); f.returnedWrite();
  assert.equal(f.observer.status().sample.count, 1);
  const before = { memory: f.memory.slice(), banks: f.m.banks.map(b => b.slice()), r: { ...f.r }, cycles: f.m.cycles, latch: f.m.sysCtrl, image: f.observer.image.slice() };
  f.observer.status(); f.observer.cache(0, 0); f.observer.beforeStep();
  assert.deepEqual(f.memory, before.memory); assert.deepEqual(f.m.banks, before.banks); assert.deepEqual(f.r, before.r);
  assert.equal(f.m.cycles, before.cycles); assert.equal(f.m.sysCtrl, before.latch); assert.deepEqual(f.observer.image, before.image);
});

test('ambiguous rejected metadata remains an error across zero samples and warm boot, but host reset starts a new epoch', () => {
  const f = fixture(); f.initialized(); f.put('HKERR', 1); f.returnedWrite();
  assert.equal(f.observer.status().ambiguousError, true);
  f.put('HKERR', 0); f.returnedWrite(); assert.equal(f.observer.status().error, true);
  f.transition(s.WBOOTR, s.WBOOTR + 1); assert.equal(f.observer.status().error, true);
  f.observer.reset(); assert.equal(f.observer.status().error, false); assert.equal(f.observer.status().sample, null);
});

test('admission snapshots inputs before await and exposes no mutable trusted map or ROM', async () => {
  const callerROM = rom.slice(), callerMap = new Map(symbols);
  const pending = bindGuestProfile(callerROM, callerMap);
  callerROM[0] ^= 1; callerMap.set('HKQ', 0);
  const admitted = await pending;
  assert.equal(admitted.supported, true);
  assert.throws(() => { admitted.symbols = callerMap; }, TypeError);
  const f = fixture(), observed = new GuestCacheObserver(f.m, admitted, profile.memoryProfile, f.observer.image);
  assert.equal(observed.supported, true); assert.equal(observed.symbols.HKQ, s.HKQ);
  f.memory[0xc000] ^= 1;
  assert.equal(new GuestCacheObserver(f.m, admitted, profile.memoryProfile, f.observer.image).supported, false);
  const duplicate = new Map(symbols); duplicate.set('hkq', s.HKQ);
  assert.equal((await bindGuestProfile(rom, duplicate)).supported, false);
});

test('invalid step sequences disarm return witnesses and status samples are immutable', () => {
  const f = fixture(); f.initialized(); f.queue(); f.r.sp = 0x7000; f.r.c = 21; f.word(0x7000, 0x2345);
  f.transition(s.BENTRY, s.BENTRY + 4);
  f.observer.afterStep({ pc: s.BENTRY, serial: -10, cycles: -1 });
  f.word(s.OLDSP, 0x7000); f.r.sp = 0x7000;
  f.transition(s.RETWORD + 9, 0x2345, () => { f.r.sp += 2; });
  assert.equal(f.observer.status().sample, null);
  f.returnedWrite(); const sample = f.observer.status().sample;
  assert.throws(() => { sample.count = 0; }, TypeError);
  assert.equal(f.observer.status().sample.count, 1);
});

for (const kind of ['hardware', 'bios']) test(`only installed and restored outer ${kind} frames yield return samples`, () => {
  const f = fixture(); f.initialized(); f.queue(); f.r.sp = 0x7000;
  if (kind === 'hardware') {
    f.word(0x7000, 0x2345); f.transition(s.SVCDSP, s.SVCDSP + 3);
    f.put('HKDEP', 1); f.word(s.APIRTPC, 0x2345); f.word(0x7000, s.HKAPIRET);
    f.transition(s.SVGO - 1, s.SVGO);
  } else {
    f.word(0x7000, s.HKBI2 + 3); f.word(0x7002, 0x2345); f.transition(s.HKBENTER, s.HKBENTER + 1);
    f.put('HKDEP', 1); f.word(s.APIRTPC, 0x2345); f.word(0x7002, s.HKAPIRET);
    f.transition(s.HKBINEST - 1, s.HKBI2 + 3, () => { f.r.sp = 0x7002; });
  }
  f.put('HKDEP', 0); f.word(f.r.sp, 0x2345);
  f.transition(s.HKAPIRET + 8, 0x2345, () => { f.r.sp += 2; });
  assert.equal(f.observer.status().sample.kind, 'hardware or BIOS return'); assert.equal(f.observer.status().sample.count, 1);
});

test('default input needs original caller, default hooks and a witnessed required CKEY return', () => {
  for (const valid of [true, false]) {
    const f = fixture(); f.initialized(); f.r.sp = 0x7000; f.r.c = 1; f.word(0x7000, 0x2345);
    f.transition(s.BENTRY, s.BENTRY + 4); f.word(s.OLDSP, 0x7000); f.put('HKDEP', 1);
    f.transition(s.FNCIN, s.FNCIN + 3);
    for (const [offset, target] of [[6, s.HKBI2], [9, valid ? s.HKBI3 : s.BCONIN]]) { f.memory[s.RAMBIOS + offset] = 0xc3; f.word(s.RAMBIOS + offset + 1, target); }
    f.r.sp = 0xbe10; f.word(f.r.sp, 0x3456);
    f.transition(s.BCONIN, s.CKEY, () => { f.r.sp -= 2; f.word(f.r.sp, s.BCONIN + 3); });
    f.transition(s.MEMINIT + 38, s.BCONIN + 3, () => { f.r.sp += 2; });
    f.transition(s.BCONIN + 3, s.CINLP);
    assert.equal(f.observer.status().sample?.kind ?? null, valid ? 'default input' : null);
  }
});

function reportFixture({ silent = false, ambiguous = false } = {}) {
  const f = fixture(); f.initialized();
  if (ambiguous) { f.put('HKERR', 1); f.returnedWrite(); }
  f.put('HKERR', 2); f.put('ERRMODE', silent ? 255 : 0);
  f.r.sp = 0x7000; f.word(f.r.sp, 0x2345);
  f.transition(s.HKWORK, s.HKWORK + 4, () => { f.word(s.HKSP, 0x7000); });
  f.put('HKBUSY', 1); f.r.sp = s.HKSTKT - 10;
  f.transition(s.HKNOTICE - 20, s.HKNOTICE, () => { f.r.sp -= 2; f.word(f.r.sp, s.HKNOTICE - 17); });
  return f;
}

test('silent report return retains the pending-error episode', () => {
  const f = reportFixture({ silent: true });
  f.transition(s.HKNOTICE + 4, s.HKNOTICE - 17, () => { f.r.sp += 2; });
  assert.equal(f.observer.status().error, true); assert.equal(f.observer.status().resolvedPending, false);
});

for (const ambiguous of [false, true]) test(`proved non-silent resolution preserves ambiguous error=${ambiguous}`, () => {
  const f = reportFixture({ ambiguous }); f.r.h = s.HKOKMSG >> 8; f.r.l = s.HKOKMSG & 255;
  f.transition(s.HKNCLR, s.HKNCLR + 1, () => { f.put('HKERR', 0); });
  f.transition(s.MEMINIT + 38, s.HKNOTICE - 17, () => { f.r.sp += 2; });
  assert.equal(f.observer.status().resolvedPending, true); assert.equal(f.observer.status().error, ambiguous);
});

test('reporter callback new work is a new fact; nonlocal escape cannot fabricate a completed report', () => {
  for (const escape of [false, true]) {
    const f = reportFixture(); f.r.h = s.HKOKMSG >> 8; f.r.l = s.HKOKMSG & 255;
    f.transition(s.HKNCLR, s.HKNCLR + 1, () => { f.put('HKERR', 0); });
    f.queue(); f.put('HKERR', 1);
    if (escape) f.transition(s.WBOOTR, s.WBOOTR + 1);
    f.transition(s.MEMINIT + 38, s.HKNOTICE - 17, () => { f.r.sp += 2; });
    assert.equal(f.observer.status().error, true);
    assert.equal(f.observer.status().resolvedPending, false);
    if (escape) assert.equal(f.observer.status().sample, null);
    else assert.equal(f.observer.status().sample.count, 1);
  }
});

test('Buffer admission owns bytes before await instead of retaining a slice alias', async () => {
  const caller = Buffer.from(rom); const pending = bindGuestProfile(caller, symbols);
  caller[0] ^= 1;
  const admitted = await pending; const f = fixture();
  assert.equal(admitted.supported, true);
  assert.equal(new GuestCacheObserver(f.m, admitted, profile.memoryProfile, f.observer.image).supported, true);
});
