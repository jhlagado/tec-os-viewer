// Under CON TTY TEC-OS doesn't scan the
// matrix, so the page lets a matrix key
// go after a short hold, and the keys
// behind it are not stuck. In the page's
// machine, PICO9918 at 40 columns: HELLO3
// under MON3.SVC sees the page's Esc
// and returns to MON3>, and EXIT, queued
// behind the Esc on the serial line,
// reaches A>. At A> under CON TTY
// nothing reads the matrix: a key from
// the screen is let go and DIR, queued
// behind it on serial, runs; without
// the bound the key stays down and DIR
// is never sent. After a key is let go
// the next waits through a gap with no
// key down: at A> the second of two
// queued keys goes down a whole hold
// after the first goes up. HELLO3
// counts both of 1 and 2, which
// MON3.SVC's scan gives with or without
// the gap, and 1 then Esc ends it. On
// CRT: MON3.SVC records the matrix keys
// it reads as TEC-OS's scan does, so
// HELLO3 takes 1 then Esc, and EXIT
// reaches A>. On CRT:, and on the GLCD
// board before the shell has run
// STARTUP.CMD's GLCD.SVC line, the
// page's keys wait for TEC-OS's scan
// and none is let go: typed ahead
// while TAS builds DEMO, or typed while
// the board starts, also with
// STARTUP.CMD late in A:'s directory.
// Nor is one let go, or taken as read,
// on bytes read while a program has
// EXPAND 1 in TEC-OS's 8000h-BFFFh
// window, which may look like CON TTY
// or like the key in KBLAST. Startup
// is over at the first console read
// that waits: under CON TTY from
// STARTUP.CMD a screen key is let go
// at MON3> before anything is typed,
// and at the first prompt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { HOLD_CYCLES, pumpKeys } from "../src/keys.mjs";
import { card, power } from "./lib/page.mjs";

const LIMIT = 400_000_000; // Per-step cycle limit.

/** Run M for CYCLES, moving its key queue with PUMP. */
function run(m, cycles, pump) {
  const end = m.cycles + cycles;
  m.runUntil(() => (pump(m), m.cycles >= end), cycles + 1_000_000, "the run");
}

/** A: on IMAGE, writable. */
function driveA(image) {
  const v = findVolume(parseContainer(image), "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
}

/** The starter card with STARTUP.CMD holding LINES. */
async function startupCard(...lines) {
  const image = await card();
  driveA(image).write("STARTUP.CMD", Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1"));
  return image;
}

/** Run M until DONE, moving its key queue after every step, as the page does. */
function runPage(m, done, what, maxCycles = LIMIT) {
  m.runUntil(() => (pumpKeys(m), done()), maxCycles, what);
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

/**
 * Run M with its key queue moving until
 * it is empty, and give how each key
 * left: "read" by TEC-OS's scan, or
 * "let go" by the page's bound.
 */
function fates(m, maxCycles) {
  const out = [];
  m.runUntil(() => {
    const head = m.pending?.[0];
    if (!head) return true;
    pumpKeys(m);
    if (m.pending[0] !== head) out.push(head.letGo === undefined ? "read" : "let go");
    return false;
  }, maxCycles, "an empty key queue");
  return out;
}

/** HELLO3's last key: the byte that SHOWN clears with xor a, ld (KEY),a. */
function keyAddress(m) {
  for (let a = 0x4000; a < 0x4100; a += 1) {
    if (m.read(a) === 0xaf && m.read(a + 1) === 0x32) return m.read(a + 2) | (m.read(a + 3) << 8);
  }
  throw new Error("no ld (KEY),a in HELLO3");
}

/** A machine at MON3> with HELLO3 running under CON TTY. */
async function hello3() {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready(), LIMIT, "the prompt");
  m.command("CON TTY");
  assert.ok(!m.videoConsole(), "CON: is TTY:");
  m.command("MON3.SVC", { prompt: /MON3>$/ });
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

/** A machine at A> under CON TTY. */
async function ttyPrompt() {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready(), LIMIT, "the prompt");
  m.command("CON TTY");
  return m;
}

test("at A> under CON TTY a matrix key is let go and DIR behind it runs; without the bound it stays down", { timeout: 300_000 }, async () => {
  let m = await ttyPrompt();
  let down = watchKeys(m);
  let mark = m.output.length;
  m.enqueueInput("x", "matrix");
  m.enqueueInput("DIR\r", "serial");
  m.runUntil(() => (pumpKeys(m), !m.pending.length && m.ready() && /A>$/.test(m.text(mark))), LIMIT, "DIR and the prompt");
  assert.match(m.text(mark), /HELLO3\.BIN/, "DIR lists the card");
  assert.equal(down.size, 0, "no matrix key held");

  m = await ttyPrompt();
  down = watchKeys(m);
  mark = m.output.length;
  m.enqueueInput("x", "matrix");
  m.enqueueInput("DIR\r", "serial");
  run(m, 50 * HOLD_CYCLES, (x) => x.pumpInput());
  assert.equal(down.size, 1, "the x is still down");
  assert.equal(m.pending.length, 5, "DIR waits behind it");
  assert.doesNotMatch(m.text(mark), /DIR/);
});

test("at A> under CON TTY the second of two queued matrix keys goes down a hold after the first is let go", { timeout: 300_000 }, async () => {
  const m = await ttyPrompt();
  const events = [];
  const apply = m.tec1g.applyMatrixKey.bind(m.tec1g);
  m.tec1g.applyMatrixKey = (row, col, pressed) => {
    events.push({ key: `${row},${col}`, pressed, at: m.cycles });
    return apply(row, col, pressed);
  };
  m.enqueueInput("xy", "matrix");
  m.runUntil(() => (pumpKeys(m), !m.pending.length), LIMIT, "an empty key queue");
  const [xDown, xUp, yDown, yUp] = events;
  assert.equal(events.length, 4, "each key down once and up once");
  assert.ok(xDown.pressed && !xUp.pressed && xUp.key === xDown.key, "x down, then up");
  assert.ok(yDown.pressed && !yUp.pressed && yDown.key !== xDown.key, "then y down, then up");
  assert.ok(xUp.at - xDown.at >= HOLD_CYCLES, `x held ${xUp.at - xDown.at} cycles`);
  assert.ok(yDown.at - xUp.at >= HOLD_CYCLES, `y went down ${yDown.at - xUp.at} cycles after x was let go`);
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

test("under CON TTY HELLO3 counts both of two queued keys, and 1 then Esc ends it", { timeout: 300_000 }, async () => {
  let m = await hello3();
  const key = keyAddress(m);
  const seen = [];
  m.enqueueInput("12", "matrix");
  m.runUntil(() => {
    if (m.pending.length) pumpKeys(m);
    const k = m.read(key);
    if (k !== (seen.at(-1) ?? 0)) seen.push(k);
    return !m.pending.length;
  }, LIMIT, "an empty key queue");
  run(m, 2_000_000, () => {});
  assert.deepEqual(seen, [1, 2], "HELLO3's key 1, then 2");

  m = await hello3();
  const mark = m.output.length;
  m.enqueueInput("1\x1b", "matrix");
  m.runUntil(() => (pumpKeys(m), /MON3>$/.test(m.text(mark))), LIMIT, "MON3> after 1 and Esc");
  assert.equal(m.read(keyAddress(m)), 1, "HELLO3 saw the 1 first");
});

test("on CRT: while a program has EXPAND 1 in TEC-OS's window, bytes there that read as CON TTY, or as the key read, don't let a key go", { timeout: 300_000 }, async () => {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  m.enqueueInput("x", "matrix");
  pumpKeys(m);
  assert.ok(m.pending[0].down, "x is down");
  const latch = m.sysCtrl;
  const bytes = { STPOS: 0x80, STFLAG: 0, CONMOD: 0, KBLAST: m.pending[0].key };
  m.cpu.hardware.ioWrite(0xff, latch | 0x04);
  const kept = Object.keys(bytes).map((n) => [m.sym(n), m.read(m.sym(n))]);
  for (const [n, v] of Object.entries(bytes)) m.write(m.sym(n), v);
  assert.ok(!m.videoConsole(), "EXPAND 1's byte reads as CON TTY");
  pumpKeys(m, 0);
  pumpKeys(m, 0);
  const head = m.pending[0];
  const up = head.up;
  for (const [a, v] of kept) m.write(a, v);
  m.cpu.hardware.ioWrite(0xff, latch);
  assert.equal(head.letGo, undefined, "x not let go");
  assert.ok(!up, "x not taken as read");
  assert.ok(m.videoConsole(), "CON: is CRT: again");
  m.runUntil(() => (pumpKeys(m), !m.pending.length), LIMIT, "x read");
  assert.equal(head.letGo, undefined, "x read by TEC-OS's scan");
});

test("on CRT: keys typed ahead while TAS builds DEMO wait for TEC-OS's scan", { timeout: 600_000 }, async () => {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  const text = "TAS DEMO\rDIR\r";
  m.enqueueInput(text, "matrix");
  assert.deepEqual(fates(m, 2_000_000_000), Array(text.length).fill("read"), "every key read by TEC-OS");
});

test("on the GLCD board, keys typed while it starts wait for TEC-OS's scan", { timeout: 300_000 }, async () => {
  const m = power(await card(), "glcd", 40);
  m.enqueueInput("DIR\r", "matrix");
  assert.deepEqual(fates(m, 200_000_000), ["read", "read", "read", "read"], "every key read by TEC-OS");
  assert.ok(m.videoConsole(), "UC1: is the console");
});

test("on CRT: HELLO3 takes the page's 1 then Esc, and EXIT reaches A>", { timeout: 300_000 }, async () => {
  const m = power(await card(), "pico", 40);
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  assert.ok(m.videoConsole(), "CON: is CRT:");
  m.command("MON3.SVC", { prompt: /MON3>$/ });
  m.command("LOAD HELLO3.BIN", { prompt: /MON3>$/ });
  m.type("GO\r");
  run(m, 20_000_000, () => {});
  const key = keyAddress(m);
  const down = watchKeys(m);
  let mark = m.output.length;
  m.enqueueInput("1\x1b", "matrix");
  m.runUntil(() => (pumpKeys(m), !m.pending.length && /MON3>$/.test(m.text(mark))), LIMIT, "MON3> after 1 and Esc");
  assert.equal(m.read(key), 1, "HELLO3 saw the 1");
  mark = m.output.length;
  m.enqueueInput("EXIT\r", "matrix");
  m.runUntil(() => (pumpKeys(m), !m.pending.length && m.ready() && /A>$/.test(m.text(mark))), LIMIT, "A> after EXIT");
  assert.equal(down.size, 0, "no matrix key held");
  assert.deepEqual(m.violations, []);
});

test("under CON TTY from STARTUP.CMD, at MON3> before anything is typed, a screen key is let go and EXIT on serial reaches A>", { timeout: 300_000 }, async () => {
  const m = power(await startupCard("SHELL.SVC", "GLCD.SVC", "CON TTY", "MON3.SVC"), "pico", 40);
  runPage(m, () => /MON3>$/.test(m.text()), "MON3> from STARTUP.CMD");
  assert.ok(!m.videoConsole(), "CON: is TTY:");
  const down = watchKeys(m);
  const mark = m.output.length;
  m.enqueueInput("x", "matrix");
  m.enqueueInput("EXIT\r", "serial");
  runPage(m, () => !m.pending.length && m.ready() && /A>$/.test(m.text(mark)), "A> after x and EXIT");
  assert.match(m.text(mark), /EXIT\r/, "EXIT was sent");
  assert.equal(down.size, 0, "no matrix key held");
});

test("with STARTUP.CMD ending in CON TTY, a screen key at the first prompt is let go and DIR behind it runs", { timeout: 300_000 }, async () => {
  const m = power(await startupCard("SHELL.SVC", "GLCD.SVC", "CON TTY"), "pico", 40);
  runPage(m, () => m.ready(), "the first prompt");
  assert.ok(!m.videoConsole(), "CON: is TTY:");
  const down = watchKeys(m);
  const mark = m.output.length;
  m.enqueueInput("x", "matrix");
  m.enqueueInput("DIR\r", "serial");
  runPage(m, () => !m.pending.length && m.ready() && /A>$/.test(m.text(mark)), "DIR and the prompt");
  assert.match(m.text(mark), /HELLO3\.BIN/, "DIR lists the card");
  assert.equal(down.size, 0, "no matrix key held");
});

test("on the GLCD board, keys typed while it starts wait for TEC-OS's scan when STARTUP.CMD is late in A:'s directory", { timeout: 300_000 }, async () => {
  const image = await card();
  const a = driveA(image);
  const startup = a.read("STARTUP.CMD");
  a.erase("STARTUP.CMD");
  for (let i = 0; i < 60; i += 1) a.write(`F${String(i).padStart(4, "0")}.TXT`, Uint8Array.of(0x1a));
  a.write("STARTUP.CMD", startup);
  const m = power(image, "glcd", 40);
  m.enqueueInput("DIR\r", "matrix");
  assert.deepEqual(fates(m, 200_000_000), ["read", "read", "read", "read"], "every key read by TEC-OS");
  m.runUntil(() => /\[more\]|A>$/.test(m.text()), LIMIT, "DIR's listing");
  assert.match(m.text(), /A>DIR\r\r\nMOUNT\.COM/, "DIR typed whole");
});
