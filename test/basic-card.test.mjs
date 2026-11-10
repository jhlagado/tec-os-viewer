// The page's card carries BAZA and its
// first BASIC program (KD-262): its
// recipe and A: hold BAZA.COM, BAZA.RTL
// and TIMES.BAS, and in the page's
// machine, PICO9918 at 40 columns,
// BAZA TIMES builds TIMES.COM and
// TIMES runs it back to the prompt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, power, recipe } from "./lib/page.mjs";

const LIMIT = 400_000_000; // Per-step cycle limit.
const BASIC = ["BAZA.COM", "BAZA.RTL", "TIMES.BAS"];

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

test("the page's card holds BAZA.COM, BAZA.RTL and TIMES.BAS on A:", async () => {
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
