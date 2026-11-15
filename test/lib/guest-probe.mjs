// Actual CPU traces at the pinned firmware. Fixtures are installed on an
// owned card before boot; explicit command input drives normal steps only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Machine, symbolsFromD8 } from '../../tec-os/host/machine.mjs';
import { fontBytes } from '../../tec-os/tools/lib/font.mjs';
import { prepareCard } from '../../tec-os/host/card.mjs';
import { createContainer, parseContainer, findVolume, volumePayload } from '../../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../../tec-os/tools/lib/cpmfs.mjs';
import { bindGuestProfile, GuestCacheObserver } from '../../src/guest-cache.mjs';
import { checkGuestProfile } from '../../tools/guest-profile.mjs';
import { ROOT } from './root.mjs';
import shellProfile from '../fixtures/guest-shell-profile.json' with { type: 'json' };
import shellSymbols from '../fixtures/guest-shell.symbols.json' with { type: 'json' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rom = new Uint8Array(readFileSync(new URL('../../tec-os/dist/tecos.rom', import.meta.url)));
const symbols = symbolsFromD8(JSON.parse(readFileSync(new URL('../../tec-os/dist/tecos.d8.json', import.meta.url))));
const s = Object.fromEntries(symbols);
const memoryProfile = { ram96: false, windowRam: true, mains: 2, expands: 2 };
const binding = await bindGuestProfile(rom, symbols);
const LIMIT = 50_000_000;

function program({ hardware = false, bios = false } = {}) {
  const code = [], addresses = [];
  const de = target => { code.push(0x11, 0, 0); addresses.push([code.length - 2, target]); };
  const bdos = fn => code.push(0x0e, fn, 0xcd, 5, 0);
  de('fcb'); bdos(22); de('data'); bdos(26); de('fcb'); bdos(21);
  const afterWrite = 0x100 + code.length;
  if (hardware) code.push(0x0e, 0, 0xcd, s.ABICALL & 255, s.ABICALL >> 8);
  const afterHardware = 0x100 + code.length;
  if (bios) code.push(0xcd, (s.RAMBIOS + 6) & 255, (s.RAMBIOS + 6) >> 8);
  const spin = 0x100 + code.length; code.push(0xc3, spin & 255, spin >> 8);
  const fcb = 0x100 + code.length, data = fcb + 36;
  for (const [at, target] of addresses) { const value = target === 'fcb' ? fcb : data; code[at] = value & 255; code[at + 1] = value >> 8; }
  code.push(0, ...new TextEncoder().encode('OBSPEND DAT'), ...new Array(24).fill(0), ...new Array(128).fill(0x5a));
  assert.equal(code.length + 0x100, data + 128);
  return { bytes: Uint8Array.from(code), fcb, data, afterWrite, afterHardware, spin };
}

function ordinaryInput(f) {
  const m = f.m, memory = m.cpu.hardware.memory;
  const route = memory[s.CONMOD] & 1 ? 'matrix' : 'serial';
  if (m.pc !== s[route === 'matrix' ? 'CINMX' : 'CINLP'] || !m.classicBankIn || memory[s.HKDEP] !== 1 || memory[s.HKBUSY] || memory[s.STPOS] < 0x80) return null;
  const word = at => Number.isInteger(at) && at >= 0 && at < 0xffff ? memory[at] | memory[at + 1] << 8 : undefined;
  const sp = word(s.OLDSP), back = word(sp), buffer = m.lineBuf;
  if (![0x0e, 10, 0xcd, 5, 0].every((byte, i) => memory[back - 5 + i] === byte)) return null;
  const table = word(s.SHOWN); let kind;
  if (!table && sp === s.CSTKTOP - 2 && buffer === s.CMDBUF) kind = 'bare command input';
  else if (table) {
    const o = shellProfile.offsets, base = table - o.TABLE;
    if (sp === base + o.STKTOP - 2 && back === base + o.TYPED + 16 && buffer === base + o.LBUF &&
        word(base + 1) === s.BENTRY && word(base + 4) === o.REMOVE &&
        String.fromCharCode(...memory.subarray(base + 17, base + 25)) === 'SHELL   ') kind = 'shell command input';
  }
  return kind ? { kind, route, sp, back, buffer, pc: m.pc, cycles: m.cycles } : null;
}

function nestedLayoutCard(image) {
  const source = parseContainer(image);
  const result = createContainer(source.volumes.map(v => ({ geometry: v.g.name, label: v.label,
    mount: v.label === 'SYSTEM' ? 'A' : v.label === 'WORK' ? 'B' : '-', readOnly: v.readOnly })), { drives: 4 });
  const target = parseContainer(result);
  for (let i = 0; i < source.volumes.length; i++) volumePayload(result, target.volumes[i]).set(volumePayload(image, source.volumes[i]));
  assert.equal(target.volumes.find(v => v.label === 'GAMES').drive, null);
  assert.ok(!target.volumes.some(v => v.drive === 'D')); return result;
}

function puritySnapshot(m) {
  const sd = Object.fromEntries(Object.entries(m.sd).filter(([key, value]) => key !== 'image' && typeof value !== 'function'));
  return { memory: m.cpu.hardware.memory.slice(), banks: m.banks.map(bank => bank.slice()),
    cpu: Object.fromEntries(Object.entries(m.cpu.cpu).filter(([key]) => key !== 'hardware').map(([key, value]) => {
      assert.ok(typeof value === 'number' || typeof value === 'boolean' || key === 'flags' || key === 'flags_prime', `unexpected CPU snapshot field ${key}`);
      return [key, structuredClone(value)];
    })), cycles: m.cycles, latch: m.sysCtrl,
    card: m.sdImage.slice(), sd: structuredClone(sd) };
}

async function fixture({ board = 'serial', fixtureProgram = null, observe = true, purity = true, bootSteps = null, measureStack = false, cardTransform = null } = {}) {
  checkGuestProfile(); assert.equal(binding.supported, true);
  assert.equal(sha(readFileSync(new URL('../fixtures/guest-shell.symbols.json', import.meta.url))), shellProfile.symbolMapSha256);
  assert.equal(sha(readFileSync(new URL('../../tec-os/dist/files/SHELL.SVC', import.meta.url))), shellProfile.fileSha256);
  for (const [name, offset] of Object.entries(shellProfile.offsets)) assert.equal(shellSymbols[name], offset);
  Machine.font = fontBytes(`${ROOT}/tec-os`);
  let image = new Uint8Array(readFileSync(new URL('../../tec-os/dist/starter.img', import.meta.url)));
  if (cardTransform) image = cardTransform(image);
  const v = findVolume(parseContainer(image), 'A');
  if (fixtureProgram) new CpmVolume(volumePayload(image, v), v.g).write('OBSPROBE.COM', fixtureProgram.bytes);
  const prepared = prepareCard(image, 'tms', board === 'matrix' ? '40' : '80'); assert.equal(prepared.problem, null);
  const bootVolume = findVolume(parseContainer(image), 'A');
  const actualShell = new CpmVolume(volumePayload(image, bootVolume), bootVolume.g).read('SHELL.SVC');
  assert.equal(sha(actualShell), shellProfile.paddedFileSha256);
  assert.equal(sha(actualShell.subarray(0, shellProfile.fileBytes)), shellProfile.fileSha256);
  const m = new Machine({ rom, symbols, sdImage: image, ...memoryProfile,
    tms: board === 'matrix', matrix: board === 'matrix' || board === 'uc1', glcd: false, clock: new Date('2026-01-01T12:00:00Z') });
  const observer = new GuestCacheObserver(m, binding, memoryProfile, image);
  assert.equal(observer.status().supported, true);
  const observations = []; let steps = 0, purityChecks = 0, workerLowest = s.HKSTKT, maxDepth = 0, workerSamples = 0, callbackEntries = 0, nestedEntries = [];
  const step = () => {
    if (measureStack && m.classicBankIn) {
      const memory = m.cpu.hardware.memory, depth = memory[s.HKDEP], busy = memory[s.HKBUSY];
      if (m.pc === s.BENTRY && depth > 0) nestedEntries.push({ pc: m.pc, cycles: m.cycles, fn: m.cpu.cpu.c, depth, busy,
        apiReturn: memory[s.APIRTPC] | memory[s.APIRTPC + 1] << 8 });
      if (fixtureProgram?.hook === m.pc && busy) callbackEntries++;
    }
    const pre = observe ? observer.beforeStep() : null;
    const prePC = m.pc; m.step(); steps++;
    if (measureStack && m.classicBankIn) {
      maxDepth = Math.max(maxDepth, m.cpu.hardware.memory[s.HKDEP]);
      const sp = m.cpu.cpu.sp;
      if (m.cpu.hardware.memory[s.HKBUSY] && sp > s.STKTOP && sp <= s.HKSTKT) { workerLowest = Math.min(workerLowest, sp); workerSamples++; }
    }
    const eligible = [s.RETWORD + 9, s.HKAPIRET + 8].includes(prePC) ||
      [s.CINLP, s.CINMX, s.HKNOTICE, s.HKNOTICE - 17].includes(m.pc);
    const before = observe && purity && eligible ? puritySnapshot(m) : null;
    if (observe) observer.afterStep(pre);
    if (before) { assert.deepEqual(puritySnapshot(m), before); purityChecks++; }
    const status = observer.status();
    if (status.current) observations.push({ ...status.sample, a: m.cpu.cpu.a, observedError: status.error, ambiguousError: status.ambiguousError, resolvedPending: status.resolvedPending, prePC, sp: m.cpu.cpu.sp, depth: m.cpu.hardware.memory[s.HKDEP], busy: m.cpu.hardware.memory[s.HKBUSY] });
  };
  const run = (done, why) => {
    const end = m.cycles + LIMIT;
    while (!done()) {
      if (m.cycles >= end) throw Error(`${why}: cycle ceiling at ${m.pc.toString(16)}; ${JSON.stringify(observer.status())}`);
      m.pumpInput(); step();
    }
  };
  const probe = { m };
  try {
    if (observe) run(() => ordinaryInput(probe) !== null, 'explicit boot to first owned ordinary input');
    else { assert.ok(Number.isInteger(bootSteps) && bootSteps > 0); for (let i = 0; i < bootSteps; i++) { m.pumpInput(); step(); } }
  } catch (error) {
    console.log(JSON.stringify({ case: 'fixture-boot-failure', board, pc: m.pc, sp: m.cpu.cpu.sp, cycles: m.cycles,
      card: sha(image), status: observer.status(), observations,
      fixture: fixtureProgram ? { sha256: sha(fixtureProgram.bytes), bytesHex: Buffer.from(fixtureProgram.bytes).toString('hex'),
        labels: Object.fromEntries(Object.entries(fixtureProgram).filter(([name]) => name !== 'bytes')) } : null }));
    throw error;
  }
  const bootCount = steps;
  return { m, observer, image, fixtureProgram, observations, step, run, bootSteps: bootCount, get steps() { return steps; }, get purityChecks() { return purityChecks; }, get workerLowest() { return workerLowest; }, get maxDepth() { return maxDepth; }, get workerSamples() { return workerSamples; },
    get callbackEntries() { return callbackEntries; }, get nestedEntries() { return nestedEntries; },
    resetTracking() { workerLowest = s.HKSTKT; maxDepth = workerSamples = callbackEntries = 0; nestedEntries = []; } };
}


export { sha, s, memoryProfile, program, puritySnapshot, ordinaryInput, nestedLayoutCard, fixture };
