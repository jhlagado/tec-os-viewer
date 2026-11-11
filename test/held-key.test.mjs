// Under CON TTY TEC-OS doesn't scan the
// matrix, so the page lets a matrix key
// go after a short hold, and the keys
// behind it are not stuck. In the page's
// machine, PICO9918 at 40 columns: HELLO3
// under MON3.SVC /E sees the page's Esc
// and returns to MON3>, and EXIT, queued
// behind the Esc on the serial line,
// reaches A>. Without the bound the Esc
// stays down and EXIT is never sent. On
// CRT: the page's keys reach TEC-OS as
// before.

import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLD_CYCLES, pumpKeys } from "../src/keys.mjs";
import { card, power } from "./lib/page.mjs";

const LIMIT = 400_000_000; // Per-step cycle limit.

/** Run M for CYCLES, moving its key queue with PUMP. */
function run(m, cycles, pump) {
  const end = m.cycles + cycles;
  m.runUntil(() => (pump(m), m.cycles >= end), cycles + 1_000_000, "the run");
}

/** Count the matrix keys M holds down. */
function watchKeys(m) {
  const down = new Set();
  const apply = m.tec1g.applyMatrixKey.bind(m.tec1g);
  m.tec1g.applyMatrixKey = (row, col, pressed) => {
    if (pressed) down.add(`${row},${col}`);
    else down.delete(`${row},${col}`);
    return apply(row, col, pressed);
  };
  return down;
}

/** A machine at MON3> with HELLO3 running under CON TTY. */
async function hello3() {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready(), LIMIT, "the prompt");
  m.command("CON TTY");
  assert.ok(!m.videoConsole(), "CON: is TTY:");
  m.command("MON3.SVC /E", { prompt: /MON3>$/ });
  m.command("LOAD HELLO3.BIN", { prompt: /MON3>$/ });
  m.mark = m.output.length;
  m.type("GO\r");
  run(m, 20_000_000, () => {});
  const lcd = String.fromCharCode(...m.tec1g.state.lcdCtrl.lcd.slice(0, 20));
  assert.match(lcd, /^MON-3 ON TEC-OS/, "HELLO3's first LCD line");
  return m;
}

test("under CON TTY the page lets a matrix key go, and EXIT behind it reaches A>", { timeout: 300_000 }, async () => {
  const m = await hello3();
  const down = watchKeys(m);
  const mark = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  m.enqueueInput("EXIT\r", "serial");
  m.runUntil(() => (pumpKeys(m), m.ready() && /A>$/.test(m.text(mark))), LIMIT, "A> after Esc and EXIT");
  const out = m.text(mark);
  assert.match(out, /MON3>/, "Esc ended HELLO3");
  assert.match(out, /EXIT\r/, "EXIT was sent");
  assert.equal(m.pending.length, 0, "nothing left in the queue");
  assert.equal(down.size, 0, "no matrix key held");
  assert.deepEqual(m.violations, []);
});

test("without the bound, the Esc stays down under CON TTY and EXIT is never sent", { timeout: 300_000 }, async () => {
  const m = await hello3();
  const down = watchKeys(m);
  const mark = m.output.length;
  m.enqueueInput("\x1b", "matrix");
  m.enqueueInput("EXIT\r", "serial");
  run(m, 50 * HOLD_CYCLES, (x) => x.pumpInput());
  assert.equal(down.size, 1, "the Esc is still down");
  assert.equal(m.pending.length, 6, "EXIT waits behind it");
  assert.doesNotMatch(m.text(mark), /EXIT/);
});

test("on CRT: the page's matrix keys reach TEC-OS as before", { timeout: 300_000 }, async () => {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  assert.ok(m.videoConsole(), "CON: is CRT:");
  const down = watchKeys(m);
  const mark = m.output.length;
  m.enqueueInput("dir\r", "matrix");
  m.runUntil(() => (pumpKeys(m), !m.pending.length && m.ready() && /A>$/.test(m.text(mark))), LIMIT, "DIR and the prompt");
  assert.match(m.text(mark), /HELLO3\.BIN/, "DIR lists the card");
  assert.equal(down.size, 0, "no matrix key held");
});
