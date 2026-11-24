import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { A00 } from '../src/lcd-a00.mjs';
import { renderLcd, createLcdRenderer, lcdText, LCD_WIDTH, LCD_HEIGHT, LCD_BACKGROUND as BG, LCD_FOREGROUND as FG } from '../src/lcd.mjs';

const image = () => ({ width: LCD_WIDTH, height: LCD_HEIGHT, data: new Uint8ClampedArray(LCD_WIDTH * LCD_HEIGHT * 4) });
const blank = () => new Uint8Array(80).fill(32);
const pixel = (im, row, col, y, x, dy = 0, dx = 0) => [...im.data.slice(((row * 18 + 1 + y * 2 + dy) * LCD_WIDTH + col * 12 + 1 + x * 2 + dx) * 4, ((row * 18 + 1 + y * 2 + dy) * LCD_WIDTH + col * 12 + 1 + x * 2 + dx) * 4 + 4)];
function glyph(im, row, col, rows) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    assert.deepEqual(pixel(im, row, col, y, x, dy, dx), rows[y] & (16 >> x) ? FG : BG, `${row}/${col} dot ${y}/${x}`);
  }
}
function canvas() {
  const c = { textContent: '', attributes: {}, writes: 0, allocations: 0, setAttribute(k, v) { this.attributes[k] = v; } };
  c.getContext = () => ({ createImageData(w, h) { c.allocations++; assert.equal(w, LCD_WIDTH); assert.equal(h, LCD_HEIGHT); return image(); }, putImageData(im) { c.writes++; c.image = im; } });
  return c;
}

test('A00 font preserves the pinned 2048-byte ROM, arrows and block', () => {
  assert.equal(A00.length, 2048);
  assert.equal(createHash('sha256').update(A00).digest('hex'), '0977c639c2445c5d19d44257711bbd9e2ae0f7da37206193e957df5871a202c6');
  assert.deepEqual([...A00.slice(69 * 8, 70 * 8)], [31, 16, 16, 30, 16, 16, 31, 0]);
  assert.deepEqual([...A00.slice(126 * 8, 127 * 8)], [0, 4, 2, 31, 2, 4, 0, 0]);
  assert.deepEqual([...A00.slice(255 * 8)], Array(8).fill(31));
});

test('all eight custom glyphs, slot zero and mirrored codes preserve every dot', () => {
  const bytes = blank(), cgram = Uint8Array.from({ length: 64 }, (_, i) => 0xe0 | ((i * 7 + 3) & 31));
  for (let i = 0; i < 16; i++) bytes[i] = i;
  const im = image(); renderLcd(im, bytes, {}, cgram);
  for (let i = 0; i < 16; i++) glyph(im, 0, i, [...cgram.slice((i & 7) * 8, (i & 7) * 8 + 8)].map(n => n & 31));
  assert.deepEqual([...im.data.slice(0, 4)], BG, 'inter-character background retained');
});

test('ordinary text and non-ASCII A00 characters use the ROM patterns', () => {
  const bytes = blank(), codes = [69, 126, 127, 219, 255, 16];
  codes.forEach((code, i) => bytes[i] = code);
  const im = image(); renderLcd(im, bytes);
  codes.forEach((code, i) => glyph(im, 0, i, A00.slice(code * 8, code * 8 + 8)));
  assert.equal(lcdText(bytes).slice(0, 5), 'E→←□█');
});

test('Snake9 ELDERLY inverse glyphs keep the eighth row and lit background', () => {
  const font = { E: [31,16,16,30,16,16,31,0], L: [16,16,16,16,16,16,31,0], D: [28,18,17,17,17,18,28,0], R: [30,17,17,30,20,18,17,0], Y: [17,17,17,10,4,4,4,0], ' ': Array(8).fill(0) };
  const name = 'ELDERLY ', cgram = Uint8Array.from([...name].flatMap(c => font[c].map(v => v ^ 31))), bytes = blank();
  [...'Speed: '].forEach((c, i) => bytes[i] = c.charCodeAt(0));
  for (let i = 0; i < 7; i++) bytes[7 + i] = i;
  const im = image(); renderLcd(im, bytes, {}, cgram);
  for (let i = 0; i < 7; i++) glyph(im, 0, 7 + i, font[name[i]].map(v => v ^ 31));
  assert.ok(lcdText(bytes).startsWith('Speed: '));
});

test('display off suppresses text, custom glyphs and both cursor modes', () => {
  const im = image(); renderLcd(im, new Uint8Array(80), { displayOn: false, cursorOn: true, cursorBlink: true, cursorAddr: 128 }, new Uint8Array(64).fill(31), true);
  for (let i = 0; i < im.data.length; i += 4) assert.deepEqual([...im.data.slice(i, i + 4)], BG);
  assert.equal(lcdText(blank(), { displayOn: false }), '');
});

test('reported display shifts wrap within each runtime row', () => {
  const bytes = Uint8Array.from({ length: 80 }, (_, i) => 65 + i % 20);
  for (const shift of [1, -1, 20, 21, -21]) {
    const im = image(); renderLcd(im, bytes, { displayShift: shift });
    for (let r = 0; r < 4; r++) for (const c of [0, 19]) {
      const code = bytes[r * 20 + ((c + shift) % 20 + 20) % 20];
      glyph(im, r, c, A00.slice(code * 8, code * 8 + 8));
    }
  }
});

test('underline cursor maps all four DDRAM rows and follows display shifting', () => {
  for (const [r, base] of [128, 192, 148, 212].entries()) for (const at of [base + 3, (base + 3) & 127]) {
    const im = image(); renderLcd(im, blank(), { cursorOn: true, cursorAddr: at, displayShift: 1 });
    for (let row = 0; row < 4; row++) glyph(im, row, 2, row === r ? [0,0,0,0,0,0,0,31] : Array(8).fill(0));
  }
  const im = image(); renderLcd(im, blank(), { cursorOn: true, cursorAddr: 255 });
  glyph(im, 0, 0, Array(8).fill(0));
});

test('block blink and underline are independent display controls', () => {
  for (const underline of [false, true]) for (const blink of [false, true]) {
    const im = image(); renderLcd(im, blank(), { cursorOn: underline, cursorBlink: true, cursorAddr: 128 }, [], blink);
    glyph(im, 0, 0, blink ? Array(8).fill(31) : [0,0,0,0,0,0,0,underline ? 31 : 0]);
  }
});

test('retained image and state cache redraw CGRAM-only changes without frame allocations', () => {
  const c = canvas(), r = createLcdRenderer(c, () => 0), bytes = blank(), g = new Uint8Array(64); bytes[0] = 0;
  r.update({ lcd: bytes, lcdCgram: g });
  const held = c.image;
  assert.equal(r.update({ lcd: bytes.slice(), lcdCgram: g.slice() }), false);
  assert.equal(c.writes, 1);
  g[7] = 31; assert.equal(r.update({ lcdCgram: g }), true);
  glyph(c.image, 0, 0, [0,0,0,0,0,0,0,31]);
  assert.equal(c.image, held); assert.equal(c.allocations, 1);
  assert.ok(c.attributes['aria-label'].includes('custom symbol'));
  r.update({ lcd: blank(), lcdCgram: new Uint8Array(64), lcdState: { cursorOn: false, cursorBlink: false } });
  glyph(c.image, 0, 0, Array(8).fill(0));
});

test('repeated state updates do not restart 500ms cursor phases', () => {
  const c = canvas(), r = createLcdRenderer(c), p = { lcd: blank(), lcdState: { cursorBlink: true, cursorAddr: 128 } };
  r.update(p, 0); glyph(c.image, 0, 0, Array(8).fill(31));
  for (const t of [100, 200, 499]) assert.equal(r.update(p, t), false);
  r.update(p, 500); glyph(c.image, 0, 0, Array(8).fill(0));
  assert.equal(r.tick(999), false); r.tick(1000); glyph(c.image, 0, 0, Array(8).fill(31));
  r.update({ lcdState: { displayOn: false } }, 1100); glyph(c.image, 0, 0, Array(8).fill(0));
  r.update({ lcdState: { cursorBlink: false, displayOn: true } }, 1200); glyph(c.image, 0, 0, Array(8).fill(0));
});

test('the actual page frame advances LCD blink while guest execution is paused', () => {
  const c = canvas(), r = createLcdRenderer(c); r.update({ lcd: blank(), lcdState: { cursorBlink: true } }, 0);
  const source = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('function frame('), fn = source.slice(start, source.indexOf('\n}\n', start) + 3);
  const context = { state: { machine: { step() { throw Error('paused CPU executed'); } }, running: false }, last: 0, cyclesWindow: 0, windowStart: 0, lcdRenderer: r, refreshGuestStatus() {}, refreshCopyAvailability() {}, requestAnimationFrame() {} };
  runInNewContext(fn + '\nthis.frame=frame;', context); context.frame(500);
  glyph(c.image, 0, 0, Array(8).fill(0));
});
