// Exercise the actual lifecycle and event handlers with controlled I/O.
// Drawing and the CPU are stand-ins; card staging and persistence are real.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Persistence } from '../../src/persistence.mjs';
import { parseContainer, volumePayload } from '../../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../../tec-os/tools/lib/cpmfs.mjs';
import { chooseText } from '../../src/text.mjs';

export const pageSource = readFileSync(new URL('../../src/main.mjs', import.meta.url), 'utf8');
export const gate = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };
export const tick = () => new Promise(r => setImmediate(r));

export function pageHarness(image, overrides = {}) {
  const handlers = {}, elements = {}, messages = [], timers = [], writes = [];
  const element = id => elements[id] ??= {
    value: '', textContent: '', focus() {},
    addEventListener(_type, fn) { handlers[id] = fn; },
  };
  const state = { card: image, width: '40', display: 'tms', machine: null,
    machineGeneration: 0, lifecyclePending: 0, running: true, ...overrides.state };
  element('drive').value = 'A'; element('textmode').value = 'auto';
  element('profile').value = state.width; element('display').value = state.display;
  const createMachine = () => ({
    symbols: new Map([['DRVIDX', 100], ['STPOS', 10]]), sysCtrl: 0,
    waitingForInput: () => true,
    read: at => at === 10 ? 0x80 : at === 100 ? 1 : 0,
    cycles: 0, step() { this.cycles += 4; },
    reset() { this.resets = (this.resets ?? 0) + 1; },
  });
  state.machine ??= createMachine();
  const { state: _stateOverrides, ...contextOverrides } = overrides;
  const context = {
    state, Persistence, GuestCacheObserver: class { constructor(machine, _binding, _profile, image) { this.machine = machine; this.image = image; } reset() {} invalidate() {} status() { return { supported: false }; } }, parseContainer, volumePayload, CpmVolume, chooseText,
    $: element, saveCard: async bytes => { writes.push(bytes.slice()); },
    needsStarter: () => false, prepareCard: () => ({ changed: false }),
    loadRom: async () => ({ rom: new Uint8Array(), symbols: new Map() }),
    Machine: class { constructor(options) { Object.assign(this, createMachine(), { options }); } },
    appendSerial: text => messages.push(text), refreshCard() {}, refreshFiles() {},
    resetKeys() {}, localStorageSet() {}, download() {},
    setInterval: fn => { timers.push(fn); }, console,
    performance: { now: () => 0 }, requestAnimationFrame() {}, CPU_HZ: 4000000, render() {}, pumpKeys() {},
    lcdRenderer: { tick() {} },
    ...contextOverrides,
  };
  const functionSource = name => {
    const start = pageSource.indexOf(`function ${name}(`);
    if (start < 0) throw Error(`missing page function ${name}`);
    return pageSource.slice(start, pageSource.indexOf('\n}\n', start) + 3);
  };
  const life = pageSource.slice(pageSource.indexOf('// ---- Machine lifecycle'), pageSource.indexOf('// ---- Run loop'));
  const events = pageSource.slice(pageSource.indexOf('async function useCard('), pageSource.indexOf('// ---- Start'));
  const runLoop = pageSource.slice(pageSource.indexOf("// ---- Run loop"), pageSource.indexOf("// ---- Rendering"));
  runInNewContext(`${life}\n${functionSource('liveDrives')}\n${functionSource('copyVolume')}\n${functionSource('refreshCopyAvailability')}\n${events}\n${runLoop}\nthis.frame=frame;this.persistence=persistence;this.lifecycle=lifecycle;this.powerOn=powerOn;this.reset=reset;`, context);
  context.persistence.adopt(state.card, { stored: true });
  const start = () => { runInNewContext(`${pageSource.slice(pageSource.indexOf("// ---- Start"))}\nthis.startup=startup;`, context); return context.startup; };
  return { start, context, state, persistence: context.persistence, handlers, elements, messages, writes, timers };
}
