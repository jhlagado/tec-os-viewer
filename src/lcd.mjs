// Draw the runtime's LCD character RAM
// and controller state as display dots.
import { A00 } from './lcd-a00.mjs';

export const LCD_COLS = 20;
export const LCD_ROWS = 4;
export const LCD_WIDTH = LCD_COLS * 12;
export const LCD_HEIGHT = LCD_ROWS * 18;
export const LCD_BACKGROUND = [159, 194, 58, 255];
export const LCD_FOREGROUND = [28, 42, 6, 255];

const shiftOf = value => Number.isFinite(value) ? ((Math.trunc(value) % 20) + 20) % 20 : 0;
const sourceCell = (row, col, shift) => row * LCD_COLS + (col + shift) % LCD_COLS;
function cursorCell(address) {
  if (!Number.isFinite(address)) return -1;
  const at = (address & 255) | 128;
  for (const [row, base] of [0x80, 0xc0, 0x94, 0xd4].entries()) {
    if (at >= base && at < base + LCD_COLS) return row * LCD_COLS + at - base;
  }
  return -1;
}

// IMAGE is the retained 240 by 72 RGBA
// buffer. BLINK selects the block phase;
// cursor-on independently adds underline.
export function renderLcd(image, bytes, state = {}, cgram = [], blink = false) {
  const data = image.data;
  for (let p = 0; p < data.length; p += 4) data.set(LCD_BACKGROUND, p);
  if (state.displayOn === false) return;
  const shift = shiftOf(state.displayShift);
  const cursor = cursorCell(state.cursorAddr);
  for (let row = 0; row < LCD_ROWS; row++) for (let col = 0; col < LCD_COLS; col++) {
    const index = sourceCell(row, col, shift), code = (bytes?.[index] ?? 32) & 255;
    const here = cursor === index;
    for (let y = 0; y < 8; y++) {
      let bits = code < 16 ? cgram[(code & 7) * 8 + y] ?? 0 : A00[code * 8 + y];
      if (here && (state.cursorBlink && blink || state.cursorOn && y === 7)) bits = 31;
      for (let x = 0; x < 5; x++) {
        if (!(bits & (16 >> x))) continue;
        const left = col * 12 + 1 + x * 2, top = row * 18 + 1 + y * 2;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          data.set(LCD_FOREGROUND, ((top + dy) * LCD_WIDTH + left + dx) * 4);
        }
      }
    }
  }
}

export function lcdText(bytes, state = {}) {
  if (state.displayOn === false) return '';
  const shift = shiftOf(state.displayShift), rows = [];
  const special = { 92: '¥', 126: '→', 127: '←', 255: '█' };
  for (let r = 0; r < LCD_ROWS; r++) {
    let text = '';
    for (let c = 0; c < LCD_COLS; c++) {
      const code = (bytes?.[sourceCell(r, c, shift)] ?? 32) & 255;
      text += code < 16 ? '\uFFFC' : special[code] ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : ' ');
    }
    rows.push(text);
  }
  return rows.join('\n');
}

// Stable snapshots avoid repainting static
// displays. The frame clock advances blink
// without resetting it on every payload.
export function createLcdRenderer(canvas, now = () => performance.now()) {
  canvas.width = LCD_WIDTH; canvas.height = LCD_HEIGHT;
  const context = canvas.getContext('2d');
  const image = context?.createImageData(LCD_WIDTH, LCD_HEIGHT);
  const bytes = new Uint8Array(80).fill(32), cgram = new Uint8Array(64);
  const state = { displayOn: true, cursorOn: false, cursorBlink: false, cursorAddr: 0x80, displayShift: 0 };
  let dirty = true, lastBlink = false, epoch = 0;
  const copy = (source, target, fill) => {
    if (!source) return;
    for (let i = 0; i < target.length; i++) {
      const value = (source[i] ?? fill) & 255;
      if (target[i] !== value) { target[i] = value; dirty = true; }
    }
  };
  function tick(time = now()) {
    const blink = state.displayOn && state.cursorBlink && (Math.max(0, time - epoch) % 1000 < 500);
    if (!dirty && blink === lastBlink) return false;
    if (image) { renderLcd(image, bytes, state, cgram, blink); context.putImageData(image, 0, 0); }
    const text = lcdText(bytes, state);
    if (canvas.textContent !== text) canvas.textContent = text;
    canvas.setAttribute('aria-label', state.displayOn ? `20 by 4 LCD: ${text.replaceAll('\uFFFC', ' custom symbol ')}` : '20 by 4 LCD: display off');
    dirty = false; lastBlink = blink;
    return true;
  }
  function update(payload = {}, time = now()) {
    copy(payload.lcd, bytes, 32); copy(payload.lcdCgram, cgram, 0);
    const next = payload.lcdState ?? {};
    for (const key of Object.keys(state)) {
      if (next[key] === undefined) continue;
      const value = key === 'displayShift' ? shiftOf(next[key]) : next[key];
      if (state[key] !== value) {
        if (key === 'cursorBlink' && value) epoch = time;
        state[key] = value; dirty = true;
      }
    }
    return tick(time);
  }
  return { update, tick };
}
