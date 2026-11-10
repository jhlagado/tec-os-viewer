// Copy as "text or binary, by file":
// the page decides by the file's type,
// then by its bytes, and the control
// still forces text or binary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseText, fileType, isCardText, isText, looksText, trimPadding } from "../src/text.mjs";

const bytes = (s) => Buffer.from(s, "latin1");
const LF = bytes("; SNAKE0\n        ORG 0100H\n");

test("text types go on as text, whatever their bytes", () => {
  for (const type of ["ASM", "BAS", "Z80", "TXT", "INC", "MAC", "LST", "DOC", "MD", "CMD", "SUB"]) {
    assert.equal(isText(`X.${type}`, bytes("\x00\xff")), true, type);
    assert.equal(isText(`x.${type.toLowerCase()}`, bytes("\x00\xff")), true, `${type} in lower case`);
  }
  assert.equal(isText("snake0.z80", LF), true);
});

test("binary types stay as they are, even when their bytes look like text", () => {
  for (const type of ["COM", "SVC", "RTL", "BIN"]) assert.equal(isText(`X.${type}`, LF), false, type);
});

test("other files are text when every byte is printable ASCII, TAB, CR or LF", () => {
  assert.equal(isText("NOTES", bytes("one\ttwo\r\nthree\n")), true, "no type");
  assert.equal(isText("DATA.DAT", bytes("A,B,C\n")), true);
  assert.equal(isText("DATA.DAT", bytes("A\x00B")), false, "00h");
  assert.equal(isText("DATA.DAT", bytes("A\x1aB")), false, "^Z");
  assert.equal(isText("DATA.DAT", bytes("A\x1bB")), false, "ESC");
  assert.equal(isText("DATA.DAT", bytes("A\x7fB")), false, "DEL");
  assert.equal(isText("DATA.DAT", bytes("caf\xe9")), false, "a byte over 7Eh");
  assert.equal(isText("EMPTY.DAT", new Uint8Array(0)), false, "an empty file");
  assert.equal(looksText(bytes(" ~")), true);
  assert.equal(fileType("A.B.Z80"), "Z80");
  assert.equal(fileType("README"), "");
});

test("the control forces text or binary, and by file leaves it to the rule", () => {
  assert.equal(chooseText("text", "X.COM", bytes("\xc9")), true);
  assert.equal(chooseText("raw", "X.ASM", LF), false);
  assert.equal(chooseText("auto", "X.ASM", bytes("\xc9")), true);
  assert.equal(chooseText("auto", "X.COM", LF), false);
  assert.equal(chooseText("auto", "X.DAT", LF), true);
  assert.equal(chooseText("auto", "X.DAT", bytes("\xc9")), false);
});

test("copying off the card judges only the bytes before ^Z and 00h padding", () => {
  const record = (s, pad) => { const b = new Uint8Array(128).fill(pad); b.set(bytes(s)); return b; };
  assert.equal(isCardText("NOTES.DAT", record("hello\r\n", 0x1a)), true, "^Z padding");
  assert.equal(isCardText("NOTES.DAT", record("hello\r\n", 0)), true, "00h padding");
  assert.equal(isCardText("NOTES.DAT", record("hello\r\n\x1a", 0)), true, "^Z then 00h");
  assert.equal(isCardText("PROG.DAT", record("\xc3\x00\x01", 0)), false);
  assert.equal(isCardText("TED.COM", record("hello\r\n", 0x1a)), false);
  assert.deepEqual([...trimPadding(bytes("hi\n\x00\x00"))], [...bytes("hi\n")]);
});
