// VG4: the page card's worked example, on the PICO9918 board at 80 columns.
// At the prompt, TAS SAMPLE and SAMPLE print SAMPLE's three lines, as TEC-OS's
// sample.test.mjs reads them. Then in TED the hello line is edited, ^T B builds
// it and ^T R runs it, and the edited line is printed. Emulator evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, power } from "./lib/page.mjs";

const LIMIT = 400_000_000; // each step's cycles: a stall fails, naming the step
const RIGHT = "\x1b[C"; // TED's cursor right

/** Keys for M on the matrix keyboard, each when it waits for one, then until it waits with nothing queued and DONE holds. */
function keys(m, s, what, done = () => true) {
  m.enqueueInput(s, "matrix");
  try {
    m.runUntil(() => (m.pumpInput(), !m.pending?.length && m.waitingForInput() && done()), LIMIT, what);
  } catch {
    throw new Error(`${what}: not within ${LIMIT} cycles, ${m.pending?.length ?? 0} keys unread\n${m.screen().filter((l) => l.trim()).join("\n")}`);
  }
}

test("the page's card builds and runs SAMPLE at the prompt, and again from TED with its hello line edited", { timeout: 300_000 }, async () => {
  const m = power(await card(), "pico", 80);
  const screen = () => m.screen().map((l) => l.trimEnd());
  m.runUntilChecked(() => m.ready() && screen().some((l) => l === "A>"), LIMIT, "the prompt");

  keys(m, "tas sample\r", "TAS's build", () => m.ready() && screen().some((l) => /^SAMPLE\.COM written/.test(l)));
  keys(m, "sample\r", "SAMPLE's run", () => m.ready() && screen().includes("Back to the prompt."));
  assert.match(screen().join("\n"), /Hello from TEC-OS\.\nScreen: 80 by 24\nBack to the prompt\.\n\nA>/);

  keys(m, "ted sample.asm 128\r", "TED at the hello line", () => /SAMPLE\.ASM +L128 C1\b/.test(screen()[23]));
  keys(m, `${RIGHT.repeat(22)}the `, "the edit", () => /L128 C33\b/.test(screen()[23]));
  assert.ok(screen().some((l) => /^HELLO:\s+DB\s+"Hello from the TEC-OS\.",13,10,"\$"$/.test(l)), `the edited line:\n${screen().join("\n")}`);
  let mark = m.output.length;
  keys(m, "\x14b", "^T B's build", () => /TED\r\n/.test(m.text(mark)) && /SAMPLE\.ASM/.test(screen()[23]));
  assert.match(m.text(mark), /SAMPLE\.COM written/);
  mark = m.output.length;
  keys(m, "\x14r", "^T R's run", () => /Press a key/.test(m.text(mark)));
  assert.match(m.text(mark), /Hello from the TEC-OS\.\r\n/, "the edited line printed");
  keys(m, " ", "TED again", () => /L128 C33\b/.test(screen()[23]));
  keys(m, "\x11", "the prompt", () => m.text(mark).endsWith("A>"));
  assert.deepEqual(m.violations, []);
});
