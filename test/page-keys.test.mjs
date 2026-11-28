// The page keys, Shift with an arrow or Tab and Option with a letter: what the
// page sends for them, by serial and on the matrix, and what Tecos gives
// a program for them through BIOS CONIN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyInput, keyText, pumpKeys, queueInput } from "../src/keys.mjs";
import { card, power } from "./lib/page.mjs";

const key = (k, more = {}) => ({ key: k, code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...more });

test("Page Up, Page Down, Home and End are xterm's sequences by serial, and Fn with an arrow on the matrix", () => {
  for (const [k, text, arrow] of [["PageUp", "\x1b[5~", 3], ["PageDown", "\x1b[6~", 4], ["Home", "\x1b[H", 5], ["End", "\x1b[F", 6]]) {
    assert.equal(keyText(key(k)), text, k);
    assert.deepEqual(keyInput(key(k), false), { text, via: "serial" }, `${k} by serial`);
    assert.deepEqual(keyInput(key(k), true), { text, via: "matrix", key: arrow, mod: 2 }, `${k} on the matrix: Fn with key ${arrow}`);
  }
});

test("Shift with an arrow is ESC [ 1 ; 2 and its letter by serial, and Shift with the arrow key on the matrix; a plain arrow is as before", () => {
  for (const [k, letter, arrow] of [["ArrowUp", "A", 3], ["ArrowDown", "B", 4], ["ArrowLeft", "D", 5], ["ArrowRight", "C", 6]]) {
    assert.deepEqual(keyInput(key(k, { shiftKey: true }), false), { text: `\x1b[1;2${letter}`, via: "serial" }, `Shift+${k} by serial`);
    assert.deepEqual(keyInput(key(k, { shiftKey: true }), true), { text: `\x1b[1;2${letter}`, via: "matrix", key: arrow, mod: 0 }, `Shift+${k} on the matrix`);
    assert.deepEqual(keyInput(key(k), true), { text: String.fromCharCode(arrow), via: "matrix" }, `${k} on the matrix, the arrow key alone`);
    assert.equal(keyText(key(k)), `\x1b[${letter}`, `${k} by serial`);
  }
});

test("Shift with Tab is xterm's back-tab, ESC [ Z, by serial, and Shift with key 9 on the matrix; Tab alone and with Ctrl stays 09h", () => {
  assert.deepEqual(keyInput(key("Tab", { shiftKey: true }), false), { text: "\x1b[Z", via: "serial" }, "Shift+Tab by serial");
  assert.deepEqual(keyInput(key("Tab", { shiftKey: true }), true), { text: "\x1b[Z", via: "matrix", key: 9, mod: 0 }, "Shift+Tab on the matrix");
  assert.deepEqual(keyInput(key("Tab"), true), { text: "\t", via: "matrix" }, "Tab on the matrix");
  assert.equal(keyText(key("Tab")), "\t", "Tab by serial");
  assert.equal(keyText(key("Tab", { shiftKey: true, ctrlKey: true })), "\t", "Ctrl+Shift+Tab");
});

test("Option (Alt) with a letter is Ctrl with it, read from the key's code, so a Mac's accented letter doesn't matter", () => {
  assert.equal(keyText(key("å", { altKey: true, code: "KeyA" })), "\x01", "Option+A on a Mac");
  assert.equal(keyText(key("∫", { altKey: true, code: "KeyB" })), "\x02");
  assert.equal(keyText(key("Ω", { altKey: true, code: "KeyZ" })), "\x1a");
  assert.deepEqual(keyInput(key("ß", { altKey: true, code: "KeyS" }), true), { text: "\x13", via: "matrix", key: 54, mod: 1 }, "Option+S is ^S on the matrix: S, key 54, held with Ctrl");
  assert.equal(keyText(key("1", { altKey: true, code: "Digit1" })), null, "Option with a digit sends nothing");
  assert.equal(keyText(key("a", { altKey: true, ctrlKey: true, code: "KeyA" })), null, "Ctrl+Option sends nothing");
  assert.equal(keyText(key("a", { metaKey: true, code: "KeyA" })), null, "Command is the browser's");
});

// A stub at 0200h takes six bytes through BIOS CONIN into 0300h-0305h.
function conin(m, inputs) {
  const code = [];
  for (let i = 0; i < 6; i += 1) code.push(0xcd, 0x09, 0xbf, 0x32, i, 0x03);
  code.push(0x18, 0xfe);
  code.forEach((v, i) => m.write(0x200 + i, v));
  const end = 0x200 + code.length - 2;
  Object.assign(m.cpu.cpu, { sp: 0x100, pc: 0x200 });
  for (const input of inputs) queueInput(m, input);
  m.runUntil(() => (pumpKeys(m), m.pc === end), 300_000_000, "six bytes through CONIN");
  return String.fromCharCode(...Array.from({ length: 6 }, (_, i) => m.read(0x300 + i)));
}

test("on the PICO9918 board, the page's Page Down, Shift+Left and Shift+Tab reach a program as Tecos sends them", { timeout: 600_000 }, async () => {
  const m = power(await card(), "pico", 40);
  m.runUntil(() => m.ready(), 300_000_000, "the first prompt");
  const plain = (c) => keyInput(key(c), true);
  assert.equal(conin(m, [keyInput(key("PageDown"), true), plain("x"), plain("y")]), "\x1b[6~xy", "Page Down is ESC [ 6 ~");
  assert.equal(conin(m, [keyInput(key("ArrowLeft", { shiftKey: true }), true)]), "\x1b[1;2D", "Shift+Left is ESC [ 1 ; 2 D");
  assert.equal(conin(m, [keyInput(key("End"), true), plain("a"), plain("b"), plain("c")]), "\x1b[Fabc", "End is ESC [ F");
  assert.equal(conin(m, [keyInput(key("Tab", { shiftKey: true }), true), plain("t"), plain("u"), plain("v")]), "\x1b[Ztuv", "Shift+Tab is ESC [ Z");
  assert.deepEqual(m.violations, []);
});
