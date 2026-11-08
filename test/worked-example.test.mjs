// VG10 (VS1 VG4): build and run SAMPLE
// at the prompt on PICO9918, width 80.
// Edit its greeting in TED, then build
// with ^T B and run with ^T R. Check
// the edited output in the emulator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { ROOT } from "./lib/root.mjs";
import { card, power } from "./lib/page.mjs";

const LIMIT = 400_000_000; // Per-step cycle limit.
const RIGHT = "\x1b[C"; // TED cursor-right sequence.

/**
 * Queue matrix input and run until idle
 * with no queued keys and done() true.
 * Space calls to done() by at least
 * EVERY cycles. Check only when input
 * has drained and the machine waits.
 * LIMIT bounds the whole step.
 */
const EVERY = 20_000;
function keys(m, s, what, done = () => true) {
  m.enqueueInput(s, "matrix");
  let next = 0;
  const settled = () => {
    m.pumpInput();
    if (m.pending?.length || !m.waitingForInput() || m.cycles < next) return false;
    next = m.cycles + EVERY;
    return done();
  };
  try {
    m.runUntil(settled, LIMIT, what);
  } catch {
    throw new Error(`${what}: not within ${LIMIT} cycles, ${m.pending?.length ?? 0} keys unread\n${m.screen().filter((l) => l.trim()).join("\n")}`);
  }
}

/**
 * Check delivered source bytes and TED
 * coordinates. Preserve carriage-return/
 * line-feed pairs, the end-of-file byte
 * and zero record padding.
 */
function samplePosition(image) {
  const source = readFileSync(resolve(ROOT, "tec-os/programs/SAMPLE.ASM"), "utf8");
  const expected = Buffer.from(source.replace(/\n/g, "\r\n") + "\x1a", "latin1");
  const v = findVolume(parseContainer(image), "A");
  const bytes = Buffer.from(new CpmVolume(volumePayload(image, v), v.g).read("SAMPLE.ASM"));
  const padded = Buffer.alloc(Math.ceil(expected.length / 128) * 128);
  expected.copy(padded);
  assert.deepEqual(bytes, padded, "VG10: card source equals pinned source with CRLF, EOF and zero record padding");
  const lines = bytes.subarray(0, bytes.indexOf(0x1a)).toString("latin1").split("\r\n");
  const line = lines.findIndex((l) => l.startsWith('HELLO: DB "Hello from TEC-OS."')) + 1;
  assert.equal(line, 186, "VG10: the qualified greeting line");
  const text = lines[line - 1];
  assert.ok(!text.includes("\t"), "the compact greeting has no tabs to expand");
  const insertAt = text.indexOf("TEC-OS.");
  assert.ok(insertAt > 0);
  return { line, insertAt, cursor: `L${line} C${insertAt + "the ".length + 1}`,
    edited: text.slice(0, insertAt) + "the " + text.slice(insertAt) };
}

test("VG10: the card's compact source has the qualified bytes and greeting coordinates", async (t) => {
  const position = samplePosition(await card());
  assert.equal(position.cursor, "L186 C27");
  t.diagnostic(JSON.stringify(position));
});

test("the page's card builds and runs SAMPLE at the prompt, and again from TED with its hello line edited", { timeout: 300_000 }, async () => {
  const image = await card();
  const m = power(image, "pico", 80);
  const screen = () => m.screen().map((l) => l.trimEnd());
  m.runUntilChecked(() => m.ready() && screen().some((l) => l === "A>"), LIMIT, "the prompt");

  keys(m, "tas sample\r", "TAS's build", () => m.ready() && screen().some((l) => /^SAMPLE\.COM written/.test(l)));
  keys(m, "sample\r", "SAMPLE's run", () => m.ready() && screen().includes("Back to the prompt."));
  assert.match(screen().join("\n"), /Hello from TEC-OS\.\nScreen: 80 by 24\nBack to the prompt\.\n\nA>/);

  const { line, insertAt, cursor, edited } = samplePosition(image);
  keys(m, `ted sample.asm ${line}\r`, "TED at the hello line", () => new RegExp(`L${line} C1\\b`).test(screen()[23]));
  keys(m, `${RIGHT.repeat(insertAt)}the `, "the edit", () => new RegExp(`${cursor}\\b`).test(screen()[23]));
  assert.ok(screen().includes(edited), `the edited line:\n${screen().join("\n")}`);
  let mark = m.output.length;
  keys(m, "\x14b", "^T B's build", () => /TED\r\n/.test(m.text(mark)) && /SAMPLE\.ASM/.test(screen()[23]));
  assert.match(m.text(mark), /SAMPLE\.COM written/);
  mark = m.output.length;
  keys(m, "\x14r", "^T R's run", () => /Press a key/.test(m.text(mark)));
  assert.match(m.text(mark), /Hello from the TEC-OS\.\r\n/, "the edited line printed");
  keys(m, " ", "TED again", () => new RegExp(`${cursor}\\b`).test(screen()[23]));
  keys(m, "\x11", "the prompt", () => m.text(mark).endsWith("A>"));
  assert.deepEqual(m.violations, []);
});
