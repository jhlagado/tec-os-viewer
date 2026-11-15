// Build explicit guest callers before boot. Fixups are fixture origins;
// no code, register, stack or cache patch is made while a machine runs.
import assert from 'node:assert/strict';
import { s } from './guest-probe.mjs';
class Code {
  bytes = []; labels = {}; fixes = [];
  emit(...bytes) { this.bytes.push(...bytes); }
  label(name) { this.labels[name] = 0x100 + this.bytes.length; }
  address(opcode, name) {
    this.emit(opcode, 0, 0); this.fixes.push([this.bytes.length - 2, name, false]);
  }
  pointer(name) { this.emit(0, 0); this.fixes.push([this.bytes.length - 2, name, false]); }
  relative(opcode, name) { this.emit(opcode, 0); this.fixes.push([this.bytes.length - 1, name, true]); }
  de(value) { if (typeof value === 'string') this.address(0x11, value); else this.emit(0x11, value & 255, value >> 8); }
  bdos(fn) { this.emit(0x0e, fn, 0xcd, 5, 0); }
  mode(mode) { this.de(mode); this.bdos(45); }
  info() { this.emit(0x0e, 0, 0xcd, s.ABICALL & 255, s.ABICALL >> 8); }
  stop() { this.label('spin'); this.address(0xc3, 'spin'); }
  finish() {
    this.label('fcb'); this.emit(0, ...new TextEncoder().encode('OBSPEND DAT'), ...new Array(24).fill(0));
    this.label('data'); this.emit(...new Array(128).fill(0x5a));
    this.label('once'); this.emit(0); this.label('callbackStatus'); this.emit(0); this.label('callbackCount'); this.emit(0);
    this.label('screen'); this.emit(...new Array(160).fill(0x20));
    for (const [at, name, relative] of this.fixes) {
      assert.ok(Number.isInteger(this.labels[name]), `missing fixture label ${name}`);
      if (relative) { const offset = this.labels[name] - (0x100 + at + 1); assert.ok(offset >= -128 && offset <= 127); this.bytes[at] = offset & 255; }
      else { this.bytes[at] = this.labels[name] & 255; this.bytes[at + 1] = this.labels[name] >> 8; }
    }
    return { ...this.labels, bytes: Uint8Array.from(this.bytes) };
  }
}

function outputCallback(c, kind) {
  c.label('hook'); c.emit(0xf5, 0xc5, 0xd5, 0xe5);
  c.address(0x3a, 'once'); c.emit(0xb7); c.relative(0x28, 'delegate');
  c.emit(0xaf); c.address(0x32, 'once');
  c.address(0x21, 'callbackCount'); c.emit(0x34);
  if (kind === 'escape') {
    c.emit(0xe1, 0xd1, 0xc1, 0xf1, 0xc3, 0, 0);
  } else {
    // A hardware-owned reporter permits this nested BDOS caller. Make
    // returned-error mode explicit so a failed close cannot wait for input.
    c.mode(255); c.de('fcb'); c.bdos(21); c.label('callbackWriteReturned'); c.de('fcb'); c.bdos(16);
    c.address(0x32, 'callbackStatus');
  }
  c.label('delegate'); c.emit(0xe1, 0xd1, 0xc1, 0xf1); c.address(0xc3, 'memoryPut');
}


// A complete tiny in-memory UC1 driver. The reporter reaches VPUT through
// its actual private BCONOUT/VTOUT path; the callback delegates normal draws.
function memoryDriver(c) {
  c.label('table');
  for (const name of ['hook', 'memoryGet', 'memoryClear', 'memoryRestore', 'memoryRead', 'memoryWrite']) c.pointer(name);
  c.emit(0, 0, 40, 4);
  c.label('cell'); c.emit(0xf5); c.address(0x21, 'screen'); c.emit(0x11, 40, 0, 0x78, 0xb7); c.relative(0x28, 'cellColumn');
  c.label('cellRow'); c.emit(0x19, 0x3d); c.relative(0x20, 'cellRow');
  c.label('cellColumn'); c.emit(0x06, 0, 0x09, 0xf1, 0xc9);
  c.label('memoryPut'); c.address(0xcd, 'cell'); c.emit(0x77, 0xc9);
  c.label('memoryGet'); c.address(0xcd, 'cell'); c.emit(0x7e, 0xc9);
  c.label('memoryClear'); c.address(0xcd, 'cell'); c.emit(0x3e, 40, 0x91, 0xc8, 0x47);
  c.label('clearLoop'); c.emit(0x36, 0x20, 0x23); c.relative(0x10, 'clearLoop'); c.emit(0xc9);
  c.label('memoryRestore'); c.emit(0xc9);
  c.label('memoryRead'); c.emit(0x0e, 0); c.address(0xcd, 'cell'); c.emit(0x11, s.LINEBUF & 255, s.LINEBUF >> 8, 0x01, 40, 0, 0xed, 0xb0, 0xc9);
  c.label('memoryWrite'); c.emit(0x0e, 0); c.address(0xcd, 'cell'); c.emit(0xeb, 0x21, s.LINEBUF & 255, s.LINEBUF >> 8, 0x01, 40, 0, 0xed, 0xb0, 0xc9);
}

export function failureProgram({ warm = false, callback = null } = {}) {
  const c = new Code(); c.mode(255); c.de('fcb'); c.bdos(22); c.label('afterMake');
  c.de('data'); c.bdos(26); c.de('fcb'); c.bdos(21); c.label('afterWrite');
  c.info(); c.label('afterSilent');
  if (warm) c.emit(0xc3, 0, 0);
  else {
    c.mode(0); c.info(); c.label('afterPending');
    if (callback) {
      c.address(0x21, 'table'); c.emit(0x06, 3, 0x0e, 12, 0xcd, s.ABICALL & 255, s.ABICALL >> 8); c.label('afterInstall');
      c.emit(0x3a, 3, 0, 0xe6, 0xfc, 0xf6, 3, 0x32, 3, 0);
      c.emit(0x1e, 13); c.bdos(2); c.label('afterDriver');
      c.emit(0x3e, 1); c.address(0x32, 'once'); c.label('beforeRecovery');
    }
    c.info(); c.label('afterRecovery');
  }
  c.stop(); if (callback) { outputCallback(c, callback); memoryDriver(c); }
  return c.finish();
}

export function metadataProgram() {
  const c = new Code(); c.mode(255); c.de('fcb'); c.bdos(22); c.label('afterMake');
  c.mode(0); c.info(); c.label('afterReport'); c.stop(); return c.finish();
}

export function nestedProgram(index) {
  const c = new Code(); c.de('fcb'); c.bdos(22); c.de('data'); c.bdos(26); c.de('fcb'); c.bdos(21); c.label('afterWrite');
  c.emit(0x06, 3); c.de(index); c.emit(0x0e, 9, 0xcd, s.ABICALL & 255, s.ABICALL >> 8);
  c.label('afterNested'); c.stop(); return c.finish();
}

export function customInputProgram() {
  const c = new Code(); c.label('beforeStatus'); c.bdos(11); c.label('afterStatus');
  c.address(0x21, 'hook'); c.emit(0x22, (s.RAMBIOS + 10) & 255, (s.RAMBIOS + 10) >> 8); c.label('afterInstall');
  c.bdos(1); c.stop(); c.label('hook'); c.emit(0xc3, s.BCONIN & 255, s.BCONIN >> 8); return c.finish();
}

export function queueOf(f) {
  const m = f.m, memory = m.cpu.hardware.memory, bank = m.banks[0];
  assert.equal(m.sdImage, f.image); assert.equal(m.main, undefined); assert.equal(m.expand, undefined);
  assert.ok(m.classicBankIn && m.physicalBank === -1 && !(m.sysCtrl & 0x7c));
  assert.equal(memory.length, 0x10000); assert.equal(m.banks.length, 9);
  assert.ok(m.banks.every(bytes => bytes.length === 0x4000));
  assert.equal(memory[s.LATCHV], m.sysCtrl); assert.equal(memory[s.SDXB], 0);
  const count = memory[s.HKCNT]; assert.ok(count <= 30);
  assert.ok(memory[s.HKERR] <= 2 && memory[s.CANY] <= 1 && memory[s.CPEND] <= 30);
  const ids = Array.from({ length: count }, (_, i) => memory[s.HKQ + i]);
  assert.ok(ids.every(id => id < 30)); assert.equal(new Set(ids).size, count);
  const dirty = Array.from(bank.subarray(s.CDIRTY - 0x8000, s.CDIRTY - 0x8000 + 30));
  assert.ok(dirty.every(value => value === 0 || value === 1));
  assert.deepEqual(dirty.flatMap((value, id) => value ? [id] : []), [...ids].sort((a, b) => a - b));
  const queue = ids.map(id => {
    const at = s.CTAB - 0x8000 + id * 4;
    const block = [...bank.subarray(at, at + 4)].reduce((n, b, j) => n + b * 2 ** (8 * j), 0);
    assert.ok(Number.isSafeInteger(block) && (block + 1) * 512 <= f.image.length);
    return { id, block, payload: bank.slice(id * 512, id * 512 + 512) };
  });
  assert.equal(new Set(queue.map(entry => entry.block)).size, count); return queue;
}

export function refuseWrites(f, rejected) {
  const original = f.m.sd.commitWrite.bind(f.m.sd), attempts = [];
  assert.equal(f.writeAttempts, undefined); f.writeAttempts = attempts;
  f.m.sd.commitWrite = () => {
    const { start, buffer } = f.m.sd.writeState;
    assert.equal(start % 512, 0); assert.equal(buffer.length, 512);
    const block = start / 512, payload = Uint8Array.from(buffer), refuse = rejected(block, payload);
    attempts.push({ block, payload, refused: refuse });
    if (!refuse) return original();
    f.m.sd.writeState = null; f.m.sd.pendingResponse = [0x0d, 0xff]; f.m.sd.delayBytes = 1;
  };
  return attempts;
}
