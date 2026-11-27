// Ctrl with a letter on the matrix is that letter's key held with Ctrl.
// As text, 01h to 07h were keys 1 to 7, which on the TEC-1G are Ctrl, Fn,
// the four arrows and Caps Lock: Ctrl+C pressed Up, Ctrl+G Caps Lock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { keyInput, pumpKeys, queueInput } from "../src/keys.mjs";
import { card, power } from "./lib/page.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./lib/root.mjs";

// The runtime's key table, which the page bundles; it is exported for import
// only, so by the file its export map names.
const { getMatrixCombosForAscii } = await import(pathToFileURL(resolve(ROOT, "tec-os/node_modules/@jhlagado/debug80-runtime/dist/platforms/tec1g/matrix-keymap.js")));
const LIMIT = 300_000_000;
const key = (k, more = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...more });

test("Ctrl and Option with each letter are that letter's matrix key held with Ctrl, and by serial its control code", () => {
  for (let code = 1; code <= 26; code += 1) {
    const letter = String.fromCharCode(0x60 + code), text = String.fromCharCode(code);
    const plain = getMatrixCombosForAscii(letter.charCodeAt(0)).find((c) => !c.modifier && !c.capsLock);
    const held = { text, via: "matrix", key: plain.row * 8 + plain.col, mod: 1 };
    assert.deepEqual(keyInput(key(letter, { ctrlKey: true }), true), held, `Ctrl+${letter}`);
    assert.deepEqual(keyInput(key(letter.toUpperCase(), { ctrlKey: true, shiftKey: true }), true), held, `Ctrl+Shift+${letter}`);
    assert.deepEqual(keyInput(key("x", { altKey: true, code: `Key${letter.toUpperCase()}` }), true), held, `Option+${letter}`);
    assert.ok(getMatrixCombosForAscii(code).some((c) => c.modifier === "ctrl" && c.row === plain.row && c.col === plain.col), `the runtime reads Ctrl+${letter} as ${code}`);
    assert.deepEqual(keyInput(key(letter, { ctrlKey: true }), false), { text, via: "serial" }, `Ctrl+${letter} by serial`);
  }
  assert.deepEqual(keyInput(key("Tab"), true), { text: "\t", via: "matrix" }, "Tab is still the matrix's Tab");
  assert.deepEqual(keyInput(key("Enter"), true), { text: "\r", via: "matrix" }, "Enter is still Return");
  assert.deepEqual(keyInput(key("ArrowUp"), true), { text: "\x03", via: "matrix" }, "Up is still key 3");
});

test("on the page's machine, Ctrl+A, C, D, F and G and z reach a program as 01 03 04 06 07 7A", { timeout: 120_000 }, async () => {
  const image = await card();
  const a = findVolume(parseContainer(image), "A");
  // KEYS.COM: TEC-OS b5af505's test/programs/keys.asm, assembled by TAS
  // f1e4dbc. It prints six keys read by BDOS 6 in hex, then returns.
  new CpmVolume(volumePayload(image, a), a.g).write("KEYS.COM", Buffer.from(
    "0606c51eff0e06cd0500b728f6cd1b011e200e02cd0500c110e8c9f50f0f0f0fcd2401f1e60fc69027ce40275f0e02c30500",
    "hex",
  ));
  const m = power(image, "pico", 40);
  const run = (done, what) => m.runUntil(() => (pumpKeys(m), done()), LIMIT, what);
  run(() => m.ready(), "the first prompt");
  for (const k of "keys") queueInput(m, keyInput(key(k), true));
  queueInput(m, keyInput(key("Enter"), true));
  const mark = m.output.length;
  for (const k of "acdfg") queueInput(m, keyInput(key(k, { ctrlKey: true }), true));
  queueInput(m, keyInput(key("z"), true));
  run(() => / 7A $/.test(m.text(mark)) || /A(:\S*)?>\s*$/.test(m.text(mark).split("\n").at(-1)) && m.text(mark).includes(" "), "KEYS's six keys");
  assert.match(m.text(mark), /01 03 04 06 07 7A $/);
  assert.deepEqual(m.violations, []);
});
