// Copy as "text or binary, by file":
// the page takes a file as text only
// when its bytes are text, by its type
// and its bytes, and the control still
// forces text or binary. Files that
// aren't text, whatever their names,
// round-trip through the card intact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createContainer, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { cardText, chooseText, fileType, fromCard, isCardText, isText, looksText } from "../src/text.mjs";

const bytes = (s) => Buffer.from(s, "latin1");
const LF = bytes("; SNAKE0\n        ORG 0100H\n");

function volume() {
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }]);
  const v = parseContainer(image).volumes[0];
  return new CpmVolume(volumePayload(image, v), v.g);
}

/** NAME with DATA onto a card and off again under MODE, as the page copies it. */
function roundTrip(name, data, mode = "auto") {
  const fs = volume();
  fs.write(name, data, { text: chooseText(mode, name, data) });
  return Buffer.from(fromCard(mode, name, fs.read(name)));
}

/** DATA written raw as a CP/M program might, then copied off in the default mode. */
function off(name, data) {
  const fs = volume();
  fs.write(name, data);
  return Buffer.from(fromCard("auto", name, fs.read(name)));
}

test("text types go on as text when their bytes are text, high bytes and FF included", () => {
  for (const type of ["ASM", "BAS", "Z80", "TXT", "INC", "MAC", "LST", "DOC", "MD", "CMD", "SUB", "PRN", "ASC", "LIB", "HEX", "ME", "H", "C"]) {
    assert.equal(isText(`X.${type}`, LF), true, type);
    assert.equal(isText(`x.${type.toLowerCase()}`, LF), true, `${type} in lower case`);
  }
  assert.equal(isText("snake0.z80", LF), true);
  assert.equal(isText("CAFE.TXT", Buffer.from("café\n", "utf8")), true, "UTF-8");
  assert.equal(isText("LIST.PRN", bytes("page 1\fpage 2\r\n")), true, "a form feed");
  assert.equal(isText("END.TXT", bytes("last line\r\n\x1a")), true, "a final ^Z");
});

test("a text type whose bytes aren't text goes on as it is", () => {
  assert.equal(isText("TOKEN.BAS", bytes("\xff\x0a\x00\x91\x20\x22HI\x22\x00\x00\x00\x1a\x0d\x0a")), false, "a tokenised .BAS");
  assert.equal(isText("WORD.DOC", bytes("\xd0\xcf\x11\xe0\x0a\x00\x00\x1a\x0d")), false, "a binary .DOC");
  assert.equal(isText("X.TXT", bytes("A\x1bB")), false, "ESC");
  assert.equal(isText("X.TXT", bytes("A\x1aB")), false, "a ^Z before the end");
});

test("binary types stay as they are, even when their bytes look like text", () => {
  for (const type of ["COM", "SVC", "RTL", "BIN"]) assert.equal(isText(`X.${type}`, LF), false, type);
});

test("other files are text only when they are plain ASCII", () => {
  assert.equal(isText("NOTES", bytes("one\ttwo\r\nthree\n")), true, "no type");
  assert.equal(isText("DATA.DAT", bytes("A,B,C\n")), true);
  assert.equal(isText("DATA.DAT", bytes("A\x00B")), false, "00h");
  assert.equal(isText("DATA.DAT", bytes("A\x7fB")), false, "DEL");
  assert.equal(isText("DATA.DAT", bytes("caf\xe9")), false, "a byte over 7Eh");
  assert.equal(isText("EMPTY.DAT", new Uint8Array(0)), false, "an empty file");
  assert.equal(looksText(bytes(" ~")), true);
  assert.equal(looksText(bytes("\x80")), false);
  assert.equal(looksText(bytes("\x80"), true), true);
  assert.equal(fileType("A.B.Z80"), "Z80");
  assert.equal(fileType("README"), "");
});

test("the control forces text or binary, and by file leaves it to the rule", () => {
  assert.equal(chooseText("text", "X.COM", bytes("\xc9")), true);
  assert.equal(chooseText("raw", "X.ASM", LF), false);
  assert.equal(chooseText("auto", "X.ASM", bytes("\xc9\x00")), false);
  assert.equal(chooseText("auto", "X.COM", LF), false);
  assert.equal(chooseText("auto", "X.DAT", LF), true);
  assert.equal(chooseText("auto", "X.DAT", bytes("\xc9")), false);
});

test("a file's text on the card ends at a ^Z followed only by ^Z and 00h, or at 00h padding in its last record", () => {
  const record = (s, pad, records = 1) => { const b = new Uint8Array(128 * records).fill(pad); b.set(bytes(s)); return b; };
  assert.deepEqual(Buffer.from(cardText(record("hello\r\n", 0x1a))), bytes("hello\r\n"), "^Z padding");
  assert.deepEqual(Buffer.from(cardText(record("hello\r\n", 0))), bytes("hello\r\n"), "00h padding");
  assert.deepEqual(Buffer.from(cardText(record("hello\r\n\x1a", 0))), bytes("hello\r\n"), "^Z then 00h");
  assert.equal(cardText(record("Picture v1\r\n\x1a\x00\x01\x02\xff", 0)), null, "data after the ^Z");
  assert.equal(cardText(record("HEADER", 0, 4)), null, "a whole record of 00h");
  assert.equal(isCardText("NOTES.DAT", record("hello\r\n", 0x1a)), true);
  assert.equal(isCardText("PROG.DAT", record("\xc3\x00\x01", 0)), false);
  assert.equal(isCardText("TED.COM", record("hello\r\n", 0x1a)), false);
});

test("text round-trips through the card, and everything else comes back byte for byte, in whole records", () => {
  for (const [name, data] of [
    ["NOTES", bytes("hello\nworld\n")],
    ["SNAKE.Z80", bytes("ld a,1\n")],
    ["UTF8.TXT", Buffer.from("café\n", "utf8")],
    ["LIST.PRN", bytes("page 1\npage 2\f\n")],
    ["PRINT.DAT", bytes("ABCDEFGH\x0a12345678")],
    ["PROG.HEX", bytes(":0300000000C9C977\n:00000001FF\n")],
    ["STARTUP.CMD", bytes("GLCD.SVC\n")],
    ["TOKEN.BAS", bytes("\xff\x0a\x00\x91\x20\x22HI\x22\x00\x00\x00\x1a\x0d\x0a")],
    ["WORD.DOC", bytes("\xd0\xcf\x11\xe0\x0a\x00\x00\x1a\x0d")],
    ["TED.COM", bytes("\xc3\x00\x01")],
  ]) {
    // A binary comes off in whole records:
    // its bytes, then the 00h padding.
    const back = roundTrip(name, data);
    assert.deepEqual(back.subarray(0, data.length), data, name);
    assert.ok(back.subarray(data.length).every((b) => b === 0) && back.length - data.length < 128, `${name}: only padding after it`);
  }
});

test("a CP/M program's binary comes off intact: a banner, ^Z and data, or a header and whole 00h records", () => {
  const pic = bytes("Picture v1\r\n\x1a\x00\x01\x02\xff\xfe");
  const picOff = off("PIC.DAT", pic);
  assert.deepEqual(picOff.subarray(0, pic.length), pic);
  assert.equal(picOff.length, 128, "the whole record, as it is");
  const zeros = new Uint8Array(384);
  zeros.set(bytes("HEADER"));
  assert.deepEqual(off("ZEROS.DAT", zeros), Buffer.from(zeros));
  const people = new Uint8Array(512);
  people.set(bytes("REC1 ALICE  "));
  people.set(bytes("REC3 BOB    "), 256);
  assert.deepEqual(off("PEOPLE.DAT", people), Buffer.from(people));
});
