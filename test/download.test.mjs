// VE-2: a file whose directory entry names a block past DSM is damage, and
// TEC-OS's read throws on it, naming the entry. The page's Download says why
// it failed, in the card's line, and nothing is thrown in the page. In
// Chromium, with the card in the page's store. Needs npm run tecos first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, web } from "./lib/page.mjs";
import { open, serve } from "./lib/serve.mjs";

const require = createRequire(import.meta.url);

/** The page's card with DEMO.COM's first block number set past A:'s DSM, and the words TEC-OS's read gives for it. */
async function damagedCard() {
  const image = await card();
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g);
  const entry = a.scan().find((e) => e.name === "DEMO.COM" && e.extent === 0);
  const past = a.d.dsm + 1;
  const e = a.entry(entry.index);
  if (a.wide) [e[16], e[17]] = [past & 0xff, past >> 8];
  else e[16] = past;
  let words = null;
  try {
    a.read("DEMO.COM");
  } catch (err) {
    words = err.message;
  }
  return { image, words };
}

test("Download of a file whose entry names a block past DSM says why, and the page throws nothing (VE-2)", { timeout: 120_000 }, async (t) => {
  web();
  const { image, words } = await damagedCard();
  assert.match(words ?? "", /DEMO\.COM: extent 0 .* names block \d+, beyond DSM \d+/, "TEC-OS's read refuses it, naming the entry");
  const { chromium } = require("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, image, "tms", "80");
  const downloads = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  const row = page.locator("#filelist tbody tr", { hasText: "DEMO.COM" });
  await row.waitFor({ timeout: 60_000 });
  await row.locator("button").click();
  await page.waitForFunction((w) => document.getElementById("cardinfo").textContent === `Not downloaded: ${w}`, words, { timeout: 10_000 });
  assert.deepEqual(downloads, [], "nothing downloaded");
  assert.deepEqual(errors, [], "nothing thrown in the page");
  await context.close();
});
