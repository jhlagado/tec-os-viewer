// Observe only instructions the normal run loop already executes.
// Samples describe cache blocks; application buffers and file closure remain
// outside this observer. Unsupported or incoherent states stay unavailable.
import selectedProfile from './guest-profile.json' with { type: 'json' };
const profile = Object.freeze({ ...selectedProfile,
  memoryProfile: Object.freeze({ ...selectedProfile.memoryProfile }),
  spans: Object.freeze(selectedProfile.spans.map(span => Object.freeze({ ...span }))),
});

const admittedBindings = new WeakMap();
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
const canonical = symbols => JSON.stringify(Object.fromEntries([...symbols].map(([name, value]) => [name.toUpperCase(), value]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
const isByteArray = value => Object.prototype.toString.call(value) === '[object Uint8Array]';

export async function bindGuestProfile(rom, symbols) {
  try {
    // Capture both inputs before the first asynchronous digest. Admission
    // facts remain private; callers receive no mutable trusted buffers.
    if (!isByteArray(rom)) return Object.freeze({ supported: false });
    const ownedROM = new Uint8Array(rom);
    const entries = [...symbols].map(([name, value]) => [name.toUpperCase(), value]);
    if (new Set(entries.map(([name]) => name)).size !== entries.length) return Object.freeze({ supported: false });
    const ownedSymbols = new Map(entries);
    if (ownedROM.length !== 0x4000 || await digest(ownedROM) !== profile.rom ||
        await digest(new TextEncoder().encode(canonical(ownedSymbols))) !== profile.symbolMap) return Object.freeze({ supported: false });
    for (const span of profile.spans) {
      const at = ownedSymbols.get(span.symbol) + span.offset - 0xc000;
      const actual = Array.from(ownedROM.subarray(at, at + span.bytes.length / 2), b => b.toString(16).padStart(2, '0')).join('');
      if (actual !== span.bytes) return Object.freeze({ supported: false });
    }
    const binding = Object.freeze({ supported: true });
    admittedBindings.set(binding, { symbols: Object.freeze(Object.fromEntries(ownedSymbols)), rom: ownedROM });
    return binding;
  } catch { return Object.freeze({ supported: false }); }
}

export class GuestCacheObserver {
  constructor(machine, binding, memoryProfile, image) {
    this.machine = machine;
    this.image = image;
    const facts = admittedBindings.get(binding);
    this.symbols = facts?.symbols ?? Object.freeze({});
    this.supported = !!facts && binding.supported === true && machine.sdImage === image &&
      Object.entries(profile.memoryProfile).every(([key, value]) => memoryProfile?.[key] === value) &&
      !machine.main && !machine.expand && isByteArray(machine.cpu?.hardware?.memory) &&
      machine.cpu.hardware.memory.length === 0x10000 && machine.banks?.length === 9 &&
      machine.banks.every(bank => isByteArray(bank) && bank.length === 0x4000) &&
      facts.rom.every((byte, index) => machine.cpu.hardware.memory[0xc000 + index] === byte);
    const s = this.symbols;
    this.selected = new Set(['COLD', 'BENTRY', 'SVCDSP', 'HKBENTER', 'HKWORK', 'HKNOTICE',
      'HKNOK', 'HKNCLR', 'BCONIN', 'FNCIN', 'FNLINE', 'BDERR', 'CINMX', 'CINLP', 'WBOOTR', 'CPMINIT'].map(name => s[name]));
    for (const at of [s.COLDZ + 31, s.COLDRT - 3, s.MEMINIT + 38, s.RETWORD + 9,
      s.SVGO - 1, s.HKBINEST - 1, s.HKAPIRET + 8, s.HKNOTICE - 20]) this.selected.add(at);
    this.reset();
  }

  reset() {
    this.serial = 0;
    this.epoch = (this.epoch ?? 0) + 1;
    this.initialized = false;
    this.sawCold = false;
    this.clearing = false;
    this.cleared = false;
    this.cold = this.owner = this.bios = this.worker = this.report = this.last = null;
    this.pendingError = this.ambiguousError = this.resolvedPending = false;
  }

  invalidate() {
    this.cold = this.owner = this.bios = this.worker = this.report = this.last = null;
    this.sawCold = this.cleared = this.clearing = false;
  }

  physical(at) { return Number.isInteger(at) && at >= 0 && at < 0xc000 ? this.machine.cpu.hardware.memory[at] : undefined; }
  word(at) { const lo = this.physical(at), hi = this.physical(at + 1); return hi === undefined || lo === undefined ? undefined : lo | hi << 8; }
  n(name) { return this.physical(this.symbols[name]); }
  classic() {
    const m = this.machine;
    return this.initialized && m.classicBankIn && m.physicalBank === -1 &&
      !(m.sysCtrl & 0x7c) && this.n('LATCHV') === m.sysCtrl && this.n('SDXB') === 0;
  }
  rootContext() { return this.classic() && this.n('HKDEP') === 0 && this.n('HKBUSY') === 0; }
  returns(opcode) { return opcode === 0xc9 || (opcode & 0xc7) === 0xc0; }
  registers() { const r = this.machine.cpu.cpu; return { pc: this.machine.pc, sp: r.sp, hl: r.h << 8 | r.l, de: r.d << 8 | r.e, bc: r.b << 8 | r.c }; }

  cache(busy, depth) {
    const m = this.machine, s = this.symbols;
    if (!this.classic() || this.n('HKBUSY') !== busy || this.n('HKDEP') !== depth || !isByteArray(this.image)) return null;
    const count = this.n('HKCNT'), error = this.n('HKERR');
    if (count > 30 || error > 2 || this.n('CANY') > 1 || this.n('CPEND') > 30) return null;
    const ids = new Set(), blocks = new Set(), bank = m.banks[0];
    for (let i = 0; i < count; i++) {
      const id = this.physical(s.HKQ + i);
      if (id >= 30 || ids.has(id)) return null;
      ids.add(id);
      const at = s.CTAB - 0x8000 + id * 4;
      let block = 0;
      for (let j = 0; j < 4; j++) block += bank[at + j] * 2 ** (8 * j);
      if (!Number.isSafeInteger(block) || (block + 1) * 512 > this.image.length || blocks.has(block)) return null;
      blocks.add(block);
    }
    for (let id = 0; id < 30; id++) {
      const dirty = bank[s.CDIRTY - 0x8000 + id];
      if (dirty > 1 || !!dirty !== ids.has(id)) return null;
    }
    return { count, error };
  }

  sample(kind, busy, depth) {
    const value = this.cache(busy, depth);
    if (!value) { this.last = null; return null; }
    if (value.error === 1 && value.count === 0) this.ambiguousError = true;
    else if (value.error) this.pendingError = true;
    this.last = Object.freeze({ ...value, kind, serial: this.serial, epoch: this.epoch, pc: this.machine.pc, cycles: this.machine.cycles });
    return value;
  }

  hooks() {
    const s = this.symbols;
    return [6, 9].every((offset, i) => this.physical(s.RAMBIOS + offset) === 0xc3 && this.word(s.RAMBIOS + offset + 1) === s[i ? 'HKBI3' : 'HKBI2']);
  }

  beforeStep() {
    if (!this.supported) return null;
    const m = this.machine, s = this.symbols, pc = m.pc, sp = m.cpu.cpu.sp;
    const potentialReturn = (this.report && sp === s.HKSTKT - 12) || (this.bios && !this.bios.ckeyReturned && sp === this.bios.keySP);
    if (!this.selected.has(pc) && !potentialReturn) return null;
    const pre = { ...this.registers(), cycles: m.cycles, serial: this.serial, opcode: m.cpu.hardware.memory[pc], back: this.word(sp), owner: this.owner };
    if (pc === s.COLD) {
      this.initialized = false; this.sawCold = true; this.cleared = this.clearing = false;
      this.cold = this.owner = this.bios = this.worker = this.report = this.last = null;
    }
    if (pc === s.WBOOTR || pc === s.CPMINIT) this.invalidate();
    if (pc === s.COLDZ + 31 && this.sawCold && pre.hl === s.WSBASE && pre.de === s.WSBASE + 1 && pre.bc === s.WSSPAN) this.clearing = true;
    if ((pc === s.BENTRY || pc === s.SVCDSP) && this.rootContext() && Number.isInteger(pre.back)) {
      this.owner = { kind: pc === s.BENTRY ? 'bdos' : 'hardware', fn: m.cpu.cpu.c, sp, back: pre.back, installed: false };
      this.bios = null;
    }
    if (pc === s.HKBENTER && this.rootContext()) {
      const wrapper = this.word(sp);
      const known = Array.from({ length: 15 }, (_, i) => s[`HKBI${i + 2}`] + 3).includes(wrapper);
      if (known && Number.isInteger(this.word(sp + 2))) this.owner = { kind: 'bios', fn: null, sp: sp + 2, back: this.word(sp + 2), wrapper, installed: false };
      else this.owner = null;
      this.bios = null;
    }
    pre.owner = this.owner;
    if (pc === s.HKWORK && this.classic() && this.n('HKBUSY') === 0 && this.n('HKDEP') <= 2) {
      this.worker = { savedSP: sp, depth: this.n('HKDEP'), owner: this.owner };
    }
    const owner = this.owner;
    if (owner?.kind === 'bdos' && ((pc === s.FNCIN && owner.fn === 1) || (pc === s.FNLINE && owner.fn === 10) || (pc === s.BDERR && this.n('ERRMODE') < 0xfe))) owner.input = true;
    if (pc === s.BCONIN && owner && this.classic() && this.n('HKDEP') === 1 && this.n('HKBUSY') === 0 && this.hooks() &&
        (owner.kind !== 'bdos' || (owner.input && this.word(s.OLDSP) === owner.sp && this.word(owner.sp) === owner.back))) {
      this.bios = { owner, sp, back: pre.back, ckeyReturned: false, keySP: null };
    }
    if (pc === s.HKNCLR && this.report && this.report.pre?.error === 2 && this.report.pre.count === 0 &&
        this.report.nonSilent && this.n('HKERR') === 2 && this.n('HKCNT') === 0 && pre.hl === s.HKOKMSG) this.report.resolution = true;
    return pre;
  }

  afterStep(pre) {
    if (!this.supported) return;
    this.serial++;
    const m = this.machine, s = this.symbols, r = m.cpu.cpu;
    if (!pre && !this.selected.has(m.pc)) return;
    if (pre && (pre.serial !== this.serial - 1 || m.cycles <= pre.cycles)) { this.invalidate(); return; }
    if (pre?.pc === s.COLDZ + 31 && this.clearing && m.pc === pre.pc + 2 && (r.b << 8 | r.c) === 0) { this.cleared = true; this.clearing = false; }
    if (pre?.pc === s.COLDRT - 3 && this.cleared && m.pc === s.MEMINIT && r.sp === pre.sp - 2 && this.word(r.sp) === s.COLDRT) this.cold = { sp: r.sp };
    if (pre?.pc === s.MEMINIT + 38 && this.cold && m.pc === s.COLDRT && r.sp === this.cold.sp + 2 && pre.back === s.COLDRT) {
      this.initialized = true; this.cold = null;
    }
    const owner = this.owner;
    if (owner && ((pre?.pc === s.SVGO - 1 && m.pc === s.SVGO && r.sp === owner.sp) ||
        (pre?.pc === s.HKBINEST - 1 && m.pc === owner.wrapper && r.sp === owner.sp)) &&
        this.word(s.APIRTPC) === owner.back && this.word(owner.sp) === s.HKAPIRET && this.n('HKDEP') === 1) owner.installed = true;
    if (pre?.pc === s.RETWORD + 9 && owner?.kind === 'bdos') {
      if (pre.owner === owner && this.rootContext() && this.word(s.OLDSP) === owner.sp && pre.sp === owner.sp &&
          pre.back === owner.back && m.pc === owner.back && r.sp === owner.sp + 2) this.sample('BDOS return', 0, 0);
      else this.last = null;
      this.owner = this.bios = null;
    }
    if (pre?.pc === s.HKAPIRET + 8 && owner && owner.kind !== 'bdos') {
      if (owner.installed && pre.owner === owner && this.rootContext() && this.word(s.APIRTPC) === owner.back &&
          pre.sp === owner.sp && pre.back === owner.back && m.pc === owner.back && r.sp === owner.sp + 2) this.sample('hardware or BIOS return', 0, 0);
      else this.last = null;
      this.owner = this.bios = null;
    }
    const input = this.bios;
    if (input && pre?.pc === s.BCONIN && m.pc === s.CKEY && r.sp === input.sp - 2 && this.word(r.sp) === s.BCONIN + 3) input.keySP = r.sp;
    if (input && this.returns(pre?.opcode ?? -1) && pre.sp === input.keySP && pre.back === s.BCONIN + 3 && m.pc === s.BCONIN + 3 && r.sp === input.sp) input.ckeyReturned = true;
    if (input?.ckeyReturned && input.owner === this.owner && this.classic() && this.hooks() && this.n('HKBUSY') === 0 && this.n('HKDEP') === 1 &&
        r.sp === input.sp && this.word(input.sp) === input.back && m.pc === s[(this.n('CONMOD') & 1) ? 'CINMX' : 'CINLP']) this.sample('default input', 0, 1);
    const worker = this.worker;
    if (pre?.pc === s.HKNOTICE - 20 && worker && this.classic() && this.n('HKBUSY') === 1 && this.n('HKDEP') === worker.depth &&
        worker.owner === this.owner && this.word(s.HKSP) === worker.savedSP && pre.sp === s.HKSTKT - 10 &&
        m.pc === s.HKNOTICE && r.sp === s.HKSTKT - 12 && this.word(r.sp) === s.HKNOTICE - 17) {
      this.report = { worker, pre: this.sample('before write report', 1, worker.depth), nonSilent: this.n('ERRMODE') !== 255, resolution: false };
    }
    const report = this.report;
    if (report && m.pc === s.HKNOTICE - 17) {
      const valid = pre && this.returns(pre.opcode) && pre.sp === s.HKSTKT - 12 && pre.back === m.pc && r.sp === s.HKSTKT - 10 &&
        report.worker === this.worker && report.worker.owner === this.owner && this.word(s.HKSP) === report.worker.savedSP;
      const post = valid ? this.sample('after write report', 1, report.worker.depth) : null;
      if (post && report.resolution && post.error === 0) { this.pendingError = false; this.resolvedPending = true; }
      this.report = null;
    }
  }

  status() {
    return Object.freeze({ supported: !!this.supported, sample: this.last,
      current: !!this.last && this.last.serial === this.serial,
      error: this.ambiguousError || this.pendingError,
      ambiguousError: this.ambiguousError, resolvedPending: this.resolvedPending });
  }
}
