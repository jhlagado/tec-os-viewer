// A text file from the PC, with LF line
// ends, copied to A: with the page's
// default Copy as setting goes on as
// CP/M text, and TED opens it cleanly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, web } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

const SOURCE = "; SNAKE0.Z80\n        ORG  0100H\nSTART:  LD   C,9\n        LD   DE,MSG\n        CALL 5\n        RET\nMSG:    DB   \"SNAKE$\"\n";

test("an LF .z80 file copied with the default setting opens in TED with no EDIT error", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, await card(), "tms", "40");
  const screen = () => page.evaluate(() => globalThis.tecos.screen().map((l) => l.trimEnd()));
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
  assert.equal(await page.inputValue("#textmode"), "auto", "the default is text or binary, by file");

  await page.setInputFiles("#putfile", { name: "snake0.z80", mimeType: "application/octet-stream", buffer: Buffer.from(SOURCE) });
  await page.locator("#filelist tbody tr", { hasText: "SNAKE0.Z80" }).waitFor({ timeout: 60_000 });
  const image = new Uint8Array(await page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open("tecos", 1);
    r.onsuccess = () => {
      const get = r.result.transaction("cards").objectStore("cards").get("current");
      get.onsuccess = () => ok([...new Uint8Array(get.result)]);
    };
  })));
  const v = findVolume(parseContainer(image), "A");
  const stored = Buffer.from(new CpmVolume(volumePayload(image, v), v.g).read("SNAKE0.Z80"));
  const crlf = Buffer.from(SOURCE.replace(/\n/g, "\r\n") + "\x1a");
  assert.deepEqual(stored.subarray(0, crlf.length), crlf, "CRLF line ends and ^Z on the card");
  assert.ok(stored.subarray(crlf.length).every((b) => b === 0x1a), "the record padded with ^Z, not 00h");

  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
  await page.click("#tms");
  await page.keyboard.type("ted snake0.z80\n", { delay: 20 });
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^TED +SNAKE0\.Z80 +L1 C1/.test(l)) || globalThis.tecos.screen().some((l) => /EDIT error/.test(l)), null, { timeout: 60_000 });
  const lines = await screen();
  assert.ok(!lines.some((l) => /EDIT error/.test(l)), `no EDIT error:\n${lines.join("\n")}`);
  assert.equal(lines[0], "; SNAKE0.Z80", `the file's first line at the top:\n${lines.join("\n")}`);
  assert.ok(lines.includes('MSG:    DB   "SNAKE$"'), "its last line");
  assert.deepEqual(errors, []);
  await context.close();
});
