// The page's card carries BAZA, its
// first BASIC program (KD-262) and
// Baza's BOUNCE.BAS (P7 BZ-37): its
// recipe and A: hold BAZA.COM,
// BAZA.RTL, TIMES.BAS and BOUNCE.BAS.
// In the page's machine, PICO9918 at
// 40 columns, BAZA TIMES builds
// TIMES.COM and TIMES runs it back to
// the prompt; BAZA BOUNCE builds
// BOUNCE, which takes Graphics I with
// sprites, moves the ship on W/A/S/D
// taps and gives the console back on Q.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, power, recipe } from "./lib/page.mjs";

const LIMIT = 400_000_000; // Per-step cycle limit.
const BASIC = ["BAZA.COM", "BAZA.RTL", "TIMES.BAS", "BOUNCE.BAS"];

/** A:'s file names on IMAGE. */
function names(image) {
  const v = findVolume(parseContainer(image), "A");
  return new CpmVolume(volumePayload(image, v), v.g).list().map((f) => f.name);
}

/** Type S, each key when asked, then run until M waits with nothing queued and DONE holds. */
function keys(m, s, what, done) {
  m.enqueueInput(s, "matrix");
  m.runUntilChecked(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
}

test("the page's card holds BAZA.COM, BAZA.RTL, TIMES.BAS and BOUNCE.BAS on A:", async () => {
  const declared = recipe().components.flatMap((c) => c.files.map((f) => f.name));
  for (const name of BASIC) assert.ok(declared.includes(name), `${name} in the page recipe`);
  const onA = names(await card());
  for (const name of BASIC) assert.ok(onA.includes(name), `${name} on A:`);
});

test("in the page's machine, BAZA TIMES builds TIMES and TIMES runs to the prompt", { timeout: 600_000 }, async () => {
  const image = await card();
  const m = power(image, "pico", 40);
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  let mark = m.output.length;
  keys(m, "baza times\r", "BAZA's build", () => /COM written\r\n/.test(m.text(mark)) && m.ready());
  mark = m.output.length;
  keys(m, "times\r", "TIMES's first question", () => /WHAT IS YOUR NAME\? $/.test(m.text(mark)));
  keys(m, "TEC\r", "TIMES's second question", () => /PICK A NUMBER, 1 TO 12\? $/.test(m.text(mark)));
  keys(m, "7\r", "the table and the prompt", () => m.ready() && m.text(mark).endsWith("A>"));
  const run = m.text(mark);
  assert.match(run, /HI, TEC\.\r\n/);
  assert.match(run, /THE 7 TIMES TABLE:\r\n/);
  assert.match(run, /THEY ADD UP TO 546 \r\n/);
  assert.match(run, /GOODBYE, TEC!\r\n/);
  assert.ok(names(image).includes("TIMES.COM"), "TIMES.COM on A:");
  assert.deepEqual(m.violations, []);
});

test("in the page's machine, BAZA BOUNCE builds BOUNCE, which takes Graphics I with sprites, moves the ship on taps and gives A> back on Q", { timeout: 900_000 }, async () => {
  const image = await card();
  const m = power(image, "pico", 40);
  const vdp = () => m.tec1g.state.display.tms9918.stateSnapshot();
  const registers = () => Array.from(vdp().registers.slice(0, 8));
  const sprites = () => Array.from(vdp().vram.slice(0x1b00, 0x1b18));
  const run = (cycles) => {
    const end = m.cycles + cycles;
    m.runUntil(() => m.cycles >= end, cycles + 1_000_000, "BOUNCE running");
  };
  m.runUntilChecked(() => m.ready() && m.screen().some((l) => l.trimEnd() === "A>"), LIMIT, "the prompt");
  const console40 = registers();
  let mark = m.output.length;
  keys(m, "baza bounce\r", "BAZA's build", () => /COM written\r\n/.test(m.text(mark)) && m.ready());
  assert.ok(names(image).includes("BOUNCE.COM"), "BOUNCE.COM on A:");
  m.enqueueInput("bounce\r", "matrix");
  m.runUntil(() => (m.pumpInput(), !m.pending?.length), 50_000_000, "the command line");
  run(150_000_000);
  assert.deepEqual(registers(), [0, 0xc2, 6, 0x80, 0, 0x36, 7, 1], "Graphics I with 16 x 16 sprites");
  const first = sprites();
  assert.equal(first[20], 208, "five sprites, then the table's end");
  assert.deepEqual([first[16], first[17]], [150, 120], "the ship at Y 150, X 120");
  for (const k of "DDDDAAWWWS") {
    m.typeMatrix(k);
    run(20_000_000);
  }
  const moved = sprites();
  assert.deepEqual([moved[16], moved[17]], [150 - 18 + 6, 120 + 24 - 12], "the ship after DDDD AA WWW S");
  assert.notDeepEqual(moved.slice(0, 16), first.slice(0, 16), "the balls move");
  mark = m.output.length;
  m.typeMatrix("Q");
  m.runUntilChecked(() => m.ready() && /A>$/.test(m.text(mark)), LIMIT, "the prompt after Q");
  assert.match(m.text(mark), /THANKS FOR PLAYING\. SCORE -?\d+ \r\n/);
  assert.deepEqual(registers(), console40, "the console's VDP mode back");
  assert.ok(m.videoConsole(), "the PICO9918 is the console again");
  assert.deepEqual(m.violations, []);
});
