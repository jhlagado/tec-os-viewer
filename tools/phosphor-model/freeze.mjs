// Freeze actual PICO states for the presentation model. No production renderer changes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { card, power, Machine } from '../../test/lib/page.mjs';
import { renderText80, renderTms, isText80 } from '../../src/tms.mjs';
import { ROOT } from '../../test/lib/root.mjs';
export const READING = '0O 1Il []{} () ,.;: !? /\\ -_=+ SAMPLE.ASM 186';
const out = resolve(ROOT, 'evidence/vs3-model');
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

function call(m, symbol, regs = {}) {
  const c = m.cpu.cpu, flags = { ...c.flags };
  const saved = Object.fromEntries(['a','b','c','d','e','h','l','pc','sp'].map(k => [k,c[k]]));
  m.write(0xfe, 0x60); m.write(0xff, 0);
  Object.assign(c, regs, { pc: m.sym(symbol), sp: 0xfe });
  try { m.runUntil(() => m.pc === 0x60, 2_000_000, symbol); }
  finally { Object.assign(c, saved, { flags }); }
}
function say(m, text) { for (const ch of text) call(m, 'VTOUT', { c: ch.charCodeAt(0) }); call(m, 'CURSHOW'); }
async function boot(width) {
  const m = power(await card(), 'pico', width);
  m.runUntilChecked(() => m.ready() && m.screen(width).some(l => l.trim() === 'A>'), 300_000_000, `boot ${width}`);
  return m;
}
function command(m, text, done) {
  m.enqueueInput(text + '\r', 'matrix');
  m.runUntilChecked(() => { m.pumpInput(); return !m.pending?.length && done(); }, 300_000_000, text);
}
function decode(s) {
  const width = isText80(s.registers) ? 512 : 256;
  const image = { data: new Uint8ClampedArray(width * 192 * 4) };
  if (width === 512) renderText80(image, s); else assert.equal(renderTms(image, s), true);
  return { width, rgba: image.data };
}
// Independent font/position oracle for the known normal/reverse fixture cells.
function glyphProof(frame) {
  const s = frame.snapshot, r = s.registers, v = s.vram;
  const cols = frame.consoleWidth, names = cols === 80 ? (r[2] & 12) << 10 : (r[2] & 15) * 0x400;
  const patterns = (r[4] & 7) * 0x800, cell = cols === 32 ? 8 : 6, border = cols === 80 ? 16 : cols === 40 ? 8 : 0;
  const raw = decode(s), glyph = Machine.font.slice((65 - 32) * 8, (65 - 32) * 8 + 8);
  for (let reverse = 0; reverse < 2; reverse++) {
    const code = 65 | (reverse ? 128 : 0);
    assert.equal(v[names + 4 * cols + 3 + reverse], code, 'known glyph position');
    for (let y = 0; y < 8; y++) {
      assert.equal(v[patterns + code * 8 + y], glyph[y] ^ (reverse ? 255 : 0), 'known glyph bit');
      for (let x = 0; x < cell; x++) {
        const on = Boolean(glyph[y] & (128 >> x)) !== Boolean(reverse);
        const at = ((32 + y) * raw.width + border + (3 + reverse) * cell + x) * 4;
        assert.deepEqual([...raw.rgba.slice(at, at + 4)], on ? [94,220,120,255] : [0,0,0,255], 'known glyph pixel');
      }
    }
  }
  return { row: 4, columns: [3,4], codes: [65,193], normal: [...glyph], reverse: [...glyph].map(b => b ^ 255) };
}

mkdirSync(resolve(out, 'frames'), { recursive: true });
const frames = [], controls = [];
for (const width of [32,40,80]) for (const kind of ['prompt','ted','reverse','demo','reading']) {
  const m = await boot(width);
  if (kind === 'ted') command(m, 'ted sample.asm 150', () => m.waitingForInput() && m.screen(width).some(l => /L150\b/.test(l)));
  if (kind === 'reverse') {
    say(m, '\x1b[2J\x1b[HNORMAL '+ READING +'\r\n\x1b[7mREVERSE '+ READING +'\x1b[0m');
    m.write(0x2000, 65); m.write(0x2001, 193);
    call(m, 'ABICALL', { b:2, c:7, d:4, e:3, h:0x20, l:0 });
  }
  if (kind === 'reading') {
    say(m, '\x1b[2J\x1b[H' + READING);
    assert.equal(m.read(m.sym('VROW')), Math.floor(READING.length / width));
    assert.equal(m.read(m.sym('VCOL')), READING.length % width);
  }
  if (kind === 'demo') {
    command(m, 'demo', () => m.read(m.sym('VCLAIM')) !== 0 && (m.tec1g.state.display.tms9918.stateSnapshot().registers[1] & 0x10) === 0);
    const until = m.cycles + 2_000_000; m.runUntil(() => m.cycles >= until, 2_100_000, 'demo settling');
  }
  const snapshot = m.tec1g.state.display.tms9918.stateSnapshot();
  const s = { registers: [...snapshot.registers], vram: [...snapshot.vram] };
  const raw = decode(s), id = `${width}-${kind}`;
  const frame = { id, kind, consoleWidth: width, sourceWidth: raw.width, sourceHeight: 192, snapshot: s,
    rgbaSha256: sha(raw.rgba), vramSha256: sha(Uint8Array.from(s.vram)), cycles: m.cycles,
    textRows: m.screen(width), reading: kind === 'reading' ? { expected: READING, cursorRow: Math.floor(READING.length / width), cursorColumn: READING.length % width } : null };
  if (kind === 'reverse') {
    frame.glyphProof = glyphProof(frame);
    for (const mutation of ['flipped-bit','displaced']) {
      const bad = structuredClone(frame), r = bad.snapshot.registers, v = bad.snapshot.vram;
      if (mutation === 'flipped-bit') v[(r[4] & 7) * 0x800 + 65 * 8] ^= 128;
      else { const names = width === 80 ? (r[2] & 12) << 10 : (r[2] & 15) * 0x400; v[names + 4 * width + 3] = 32; v[names + 4 * width + 5] = 65; }
      let error; try { glyphProof(bad); } catch (e) { error = e.message; }
      assert.ok(error, `${mutation} must fail`);
      controls.push({ width, mutation, rejected: true, diagnostic: error, mutatedRgbaSha256: sha(decode(bad.snapshot).rgba) });
    }
  }
  assert.deepEqual(m.violations, []);
  writeFileSync(resolve(out, 'frames', id + '.rgba'), raw.rgba);
  frames.push(frame); console.log(id, raw.width, frame.rgbaSha256);
}
const pins = JSON.parse(readFileSync(resolve(ROOT,'pins.json')));
const identity = { baselineViewer: '76c4aa0', toolsCommit: git('rev-parse','HEAD'), tecos: git('-C','tec-os','rev-parse','HEAD'), pins,
  fontSource: 'tec-os/format/font5x7.txt', fontSourceSha256: sha(readFileSync(resolve(ROOT,'tec-os/format/font5x7.txt'))),
  fontBytesSha256: sha(Machine.font), selectedAssembler: process.env.TECOS_ROM_ASSEMBLER, reading: READING };
assert.equal(identity.tecos, 'fe2097f4bad3f7578aa41b8bce8aa571c451dbc7');
assert.equal(identity.selectedAssembler, 'atom');
writeFileSync(resolve(out, 'fixtures.json'), JSON.stringify({ identity, frames }, null, 2)+'\n');
writeFileSync(resolve(out, 'glyph-controls.json'), JSON.stringify(controls,null,2)+'\n');
console.log('frozen', frames.length, 'frames;', controls.length, 'negative controls detected');
