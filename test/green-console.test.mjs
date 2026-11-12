// Check the page card's palette
// and glyphs through the viewer decoder.
// Use ABI 5 PUTAT for normal and reverse
// cells. These are emulator checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { card, power, Machine } from "./lib/page.mjs";
import { renderTms, renderText80, isText80 } from "../src/tms.mjs";

const LIMIT = 300_000_000;
const widths = [32, 40, 80];
const sha = (b) => createHash("sha256").update(b).digest("hex");

async function boot(width) {
  const m = power(await card(), "pico", width);
  m.runUntilChecked(() => m.ready() && m.screen(width).some((l) => l.trim() === "A>"), LIMIT, `cold boot at ${width}`);
  return m;
}

/**
 * Write two cells at row 2, column 3
 * through ABI 5 PUTAT. Restore the
 * command processor's CPU registers.
 */
function putPair(m) {
  const cpu = m.cpu.cpu;
  const saved = Object.fromEntries(["a", "b", "c", "d", "e", "h", "l", "sp", "pc"].map((r) => [r, cpu[r]]));
  const flags = { ...cpu.flags };
  m.write(0x2000, 0x41);
  m.write(0x2001, 0xc1);
  m.write(0xfe, 0x60);
  m.write(0xff, 0);
  Object.assign(cpu, { pc: m.sym("ABICALL"), sp: 0xfe, b: 2, c: 7, d: 2, e: 3, h: 0x20, l: 0 });
  try {
    m.runUntil(() => m.pc === 0x60, 1_000_000, "PUTAT normal and reverse A");
    assert.equal(cpu.a, 0, "PUTAT succeeded");
  } finally {
    Object.assign(cpu, saved, { flags });
  }
}

function checkConsole(m, width, t) {
  assert.equal(m.read(m.sym("VWID")), width, "the ROM's width");
  putPair(m);
  const snapshot = m.tec1g.state.display.tms9918.stateSnapshot();
  const { registers: r, vram: v } = snapshot;
  assert.equal(r[7], 0x31, "register 7 selects light green (3) on black (1)");
  assert.equal(isText80(r), width === 80);
  assert.equal(Boolean(r[1] & 0x10), width !== 32);
  assert.ok(r[1] & 0x40, "the display is enabled");
  if (width === 32) {
    const groups = v.slice(r[3] * 0x40, r[3] * 0x40 + 32);
    assert.deepEqual([...groups], Array(32).fill(0x31), "all Graphics I colour groups");
  }
  const names = width === 80 ? (r[2] & 0x0c) << 10 : (r[2] & 0x0f) * 0x400;
  const patterns = (r[4] & 7) * 0x800;
  const offset = names + 2 * width + 3;
  assert.deepEqual([...v.slice(offset, offset + 2)], [0x41, 0xc1], "normal and reverse A occupy their requested cells");
  const glyph = Machine.font.slice((0x41 - 0x20) * 8, (0x41 - 0x20) * 8 + 8);
  assert.deepEqual([...v.slice(patterns + 0x41 * 8, patterns + 0x41 * 8 + 8)], [...glyph], "normal pattern equals the source font");
  assert.deepEqual([...v.slice(patterns + 0xc1 * 8, patterns + 0xc1 * 8 + 8)], [...glyph].map((b) => b ^ 255), "reverse pattern complements every bit");
  const pixels = width === 80 ? 512 : 256;
  const image = { data: new Uint8ClampedArray(pixels * 192 * 4) };
  if (width === 80) renderText80(image, snapshot);
  else assert.equal(renderTms(image, snapshot), true);
  const cell = width === 32 ? 8 : 6;
  const border = width === 80 ? 16 : width === 40 ? 8 : 0;
  for (let row = 0; row < 8; row++) for (let x = 0; x < cell; x++) for (let reverse = 0; reverse < 2; reverse++) {
    const on = Boolean(glyph[row] & (0x80 >> x)) !== Boolean(reverse);
    const at = ((16 + row) * pixels + border + (3 + reverse) * cell + x) * 4;
    assert.deepEqual([...image.data.slice(at, at + 4)], on ? [0x5e, 0xdc, 0x78, 255] : [0, 0, 0, 255], `${width} column pixel ${reverse}/${row}/${x}`);
  }
  assert.deepEqual(m.violations, []);
  t.diagnostic(JSON.stringify({ width, register7: r[7], normal: [...glyph], reverse: [...glyph].map((b) => b ^ 255), frameWidth: pixels, frameHeight: 192, rgbaSha256: sha(image.data) }));
}

for (const width of widths) test(`cold boot, palette and reverse glyphs at ${width} columns`, { timeout: 120_000 }, async (t) => {
  checkConsole(await boot(width), width, t);
});
for (const from of widths) for (const to of widths.filter((w) => w !== from)) {
  test(`directed width switch ${from} to ${to}`, { timeout: 120_000 }, async (t) => {
    const m = await boot(from);
    const mark = m.output.length;
    m.typeMatrix(`con pico ${to}\r`);
    m.runUntilChecked(() => m.ready() && m.text(mark).endsWith("A>"), LIMIT, `CON PICO ${from} to ${to}`);
    assert.doesNotMatch(m.text(mark), /\?\r\n/, "the width command was accepted");
    checkConsole(m, to, t);
  });
}
