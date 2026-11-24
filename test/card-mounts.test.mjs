// The card line and the drive list follow
// the running machine's drives, not only
// the card's mounts. In Chromium, on the
// starter card, CD C:GAMES puts GAMES on
// the spare C:, and the card line and the
// drive list show C: GAMES, with its
// files; Power cycle gives the card's own
// drives again, with GAMES on none. Run
// npm run tecos first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, web } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

const OWN = /A: SYSTEM .*B: WORK .*-: ASM .*-: BASIC .*-: MON3 .*-: GAMES/;

test("CD C:GAMES shows C: GAMES in the card line and the drive list, and Power cycle gives the card's own drives again", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const { context, page, errors } = await open(browser, url, await card(), "tms", "40");
  const prompt = () => page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A:SYSTEM>\s*$/.test(l)), null, { timeout: 60_000 });
  const line = () => page.evaluate(() => document.getElementById("cardinfo").textContent);
  const options = () => page.evaluate(() => [...document.getElementById("drive").options].map((o) => o.textContent));
  const rows = page.locator("#filelist tbody tr");
  await prompt();
  assert.match(await line(), OWN, "the card's own drives");
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK"]);

  await page.focus("#tms");
  await page.keyboard.type("cd c:games\n");
  await page.waitForFunction(() => /C: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  assert.match(await line(), /A: SYSTEM .*B: WORK .*-: ASM .*-: BASIC .*-: MON3 .*C: GAMES/, "GAMES on C:");
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK", "C: GAMES"]);
  await page.selectOption("#drive", "C");
  await rows.filter({ hasText: "CAVERNS.COM" }).waitFor({ timeout: 60_000 });
  await page.selectOption("#drive", "A");
  await rows.filter({ hasText: "SAMPLE.ASM" }).waitFor({ timeout: 60_000 });
  assert.equal(await rows.filter({ hasText: "CAVERNS.COM" }).count(), 0, "A:'s files listed");

  await page.selectOption("#drive", "C");
  await page.click("#pause");
  assert.equal(await page.locator("#pause").textContent(), "Run");
  await page.click("#power");
  await page.waitForFunction(() => /-: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK"]);
  assert.equal(await page.locator("#drive").inputValue(), "A", "the removed C: selection falls back to A:");
  assert.ok(await rows.count() > 0, "A:'s files remain available while paused");
  await page.click("#pause");
  await prompt();
  assert.match(await line(), OWN, "the card's own drives after Power cycle");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a reset with GAMES on A keeps GAMES and its own startup, and CD A:SYSTEM brings SYSTEM back", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, await card(), "tms", "40");
  const shellPrompt = (name) => page.waitForFunction((n) => globalThis.tecos.screen().some((l) => new RegExp(`^A:${n}>\\s*$`).test(l)), name, { timeout: 60_000 });
  await shellPrompt("SYSTEM");
  await page.focus("#tms");
  await page.keyboard.type("cd a:games\n");
  await shellPrompt("GAMES");
  await page.waitForFunction(() => /A: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });

  await page.click("#reset");
  // The boot banner names A:'s volume, A: GAMES, which no command before the reset prints.
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A: GAMES\s*$/.test(l)), null, { timeout: 60_000 });
  await shellPrompt("GAMES");
  assert.match(await page.locator("#cardinfo").textContent(), /A: GAMES/, "reset retains the changed selection");
  await page.focus("#tms");
  await page.keyboard.type("cd a:system\n");
  await shellPrompt("SYSTEM");
  await page.waitForFunction(() => /A: SYSTEM/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  assert.equal(await page.locator("#drive").inputValue(), "A", "the file selector stays on A:");
  const rows = page.locator("#filelist tbody tr");
  await rows.filter({ hasText: "SAMPLE.ASM" }).waitFor({ timeout: 60_000 });
  assert.equal(await rows.filter({ hasText: "CAVERNS.COM" }).count(), 0, "SYSTEM's files, not GAMES's");
  assert.deepEqual(errors, []);
  await context.close();
});
