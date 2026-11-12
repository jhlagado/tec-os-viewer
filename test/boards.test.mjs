// Boot the page card on serial,
// PICO9918, GLCD and dual-display boards.
// Test PICO widths 80, 40 and 32.
// A serial board at 40 must omit width
// errors from startup.
// With no card, require CARD? and no A>.
// Emulator checks. Run npm run tecos
// before these tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARDS, Machine, TEST_CLOCK, card, power, rom } from "./lib/page.mjs";

const BOOT = 300_000_000; // Boot and startup cycle limit.

/** Read the selected console as rows. */
function rows(m, board) {
  if (BOARDS[board].tms) return m.screen(m.read(m.sym("PIWID")) || 80).map((l) => l.trimEnd());
  if (BOARDS[board].matrix) return m.glcdScreen().map((l) => l.trimEnd());
  return m.serialText().split(/\r?\n/).map((l) => l.trimEnd());
}

/**
 * Boot the page card at the chosen width.
 * Wait for startup to finish at A>.
 */
async function boot(board, width = 80) {
  const m = power(await card(), board, width);
  m.runUntilChecked(() => m.ready() && rows(m, board).some((l) => /^A:SYSTEM>$/.test(l)), BOOT, `${board} at ${width}: the prompt`);
  return m;
}

const CASES = [
  ["serial", 80],
  ["serial", 40],
  ["pico", 80],
  ["pico", 40],
  ["pico", 32],
  ["glcd", 80],
  ["both", 80],
];

for (const [board, width] of CASES) {
  const name = { serial: "the serial board", pico: "the PICO9918 board", glcd: "the GLCD board", both: "the board with both displays" }[board];
  test(`the page's card reaches A> on ${name} at ${width}`, { timeout: 120_000 }, async () => {
    const m = await boot(board, width);
    if (BOARDS[board].tms) assert.equal(m.read(m.sym("VWID")), width, "the console's width");
    if (board === "serial") assert.doesNotMatch(m.text(0), /\d\d\?/, "nothing said of the width at boot");
    assert.deepEqual(m.violations, []);
  });
}

test("with no card the serial board gives CARD? and no prompt", { timeout: 120_000 }, () => {
  const m = new Machine({ ...rom(), sdImage: undefined, glcd: false, clock: TEST_CLOCK });
  m.expect(/R retry> $/, { from: 0, maxCycles: BOOT });
  const lcd = m.tec1g.state.lcdCtrl.lcd;
  const lines = [0, 1, 2, 3].map((r) => String.fromCharCode(...lcd.slice(r * 20, r * 20 + 20)));
  assert.ok(lines.some((l) => l.includes("CARD?")), `CARD? on the LCD:\n${lines.join("\n")}`);
  assert.doesNotMatch(m.text(0), /A(:\w*)?>/, "no prompt");
});
