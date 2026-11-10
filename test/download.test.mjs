// Report a damaged file entry in
// the card-status line without a page
// exception or download. Plant the card
// in Chromium's store. Run npm run tecos
// before this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, web } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

/**
 * Damage MOUNT.COM with a block beyond
 * A:'s maximum block number, DSM.
 * Return the card and its read error.
 */
async function damagedCard() {
  const image = await card();
  const v = findVolume(parseContainer(image), "A");
  const a = new CpmVolume(volumePayload(image, v), v.g);
  const entry = a.scan().find((e) => e.name === "MOUNT.COM" && e.extent === 0);
  const past = a.d.dsm + 1;
  const e = a.entry(entry.index);
  if (a.wide) [e[16], e[17]] = [past & 0xff, past >> 8];
  else e[16] = past;
  let words = null;
  try {
    a.read("MOUNT.COM");
  } catch (err) {
    words = err.message;
  }
  return { image, words };
}

test("Download of a file whose entry names a block past DSM says why, and the page throws nothing", { timeout: 120_000 }, async (t) => {
  web();
  const { image, words } = await damagedCard();
  assert.match(words ?? "", /MOUNT\.COM: extent 0 .* names block \d+, beyond DSM \d+/, "TEC-OS's read refuses it, naming the entry");
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, image, "tms", "80");
  const downloads = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  const row = page.locator("#filelist tbody tr", { hasText: "MOUNT.COM" });
  await row.waitFor({ timeout: 60_000 });
  await row.locator("button").click();
  await page.waitForFunction((w) => document.getElementById("cardinfo").textContent === `Not downloaded: ${w}`, words, { timeout: 10_000 });
  assert.deepEqual(downloads, [], "nothing downloaded");
  assert.deepEqual(errors, [], "nothing thrown in the page");
  await context.close();
});
