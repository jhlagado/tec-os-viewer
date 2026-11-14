// The card line and the drive list follow
// the running machine's drives, not only
// the card's mounts. In Chromium, on the
// starter card, CD D:GAMES puts GAMES on
// D:, and the card line and the drive
// list show D: GAMES, with its files;
// Power cycle gives the card's own drives
// again, with GAMES on none. Run npm run
// tecos first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { card, web } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

test("CD D:GAMES shows D: GAMES in the card line and the drive list, and Power cycle gives the card's own drives again", { timeout: 180_000 }, async (t) => {
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
  await prompt();
  assert.match(await line(), /A: SYSTEM .*B: WORK .*C: PROJECTS .*-: GAMES .*-: SPARE/, "the card's own drives");
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK", "C: PROJECTS"]);

  await page.focus("#tms");
  await page.keyboard.type("cd d:games\n");
  await page.waitForFunction(() => /D: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  assert.match(await line(), /A: SYSTEM .*B: WORK .*C: PROJECTS .*D: GAMES .*-: SPARE/, "GAMES on D:");
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK", "C: PROJECTS", "D: GAMES"]);
  await page.selectOption("#drive", "D");
  assert.equal(await page.evaluate(() => document.querySelectorAll("#filelist tbody tr").length), 0, "GAMES is empty");
  await page.selectOption("#drive", "A");
  assert.ok(await page.evaluate(() => document.querySelectorAll("#filelist tbody tr").length) > 0, "A:'s files listed");

  await page.selectOption("#drive", "D");
  await page.click("#pause");
  assert.equal(await page.locator("#pause").textContent(), "Run");
  await page.click("#power");
  await page.waitForFunction(() => /-: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  assert.deepEqual(await options(), ["A: SYSTEM", "B: WORK", "C: PROJECTS"]);
  assert.equal(await page.locator("#drive").inputValue(), "A", "the removed D: selection falls back to A:");
  assert.ok(await page.locator("#filelist tbody tr").count() > 0, "A:'s files remain available while paused");
  await page.click("#pause");
  await prompt();
  assert.match(await line(), /A: SYSTEM .*B: WORK .*C: PROJECTS .*-: GAMES .*-: SPARE/, "the card's own drives after Power cycle");
  assert.deepEqual(errors, []);
  await context.close();
});

test("ROM CD restores SYSTEM and the shell after a reset with GAMES on A", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, await card(), "tms", "40");
  const shellPrompt = () => page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A:SYSTEM>\s*$/.test(l)), null, { timeout: 60_000 });
  await shellPrompt();
  await page.focus("#tms");
  await page.keyboard.type("cd a:games\n");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A:GAMES>\s*$/.test(l)), null, { timeout: 60_000 });
  await page.waitForFunction(() => /A: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });

  await page.click("#reset");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
  assert.match(await page.locator("#cardinfo").textContent(), /A: GAMES/, "reset retains the changed selection");
  await page.focus("#tms");
  await page.keyboard.type("cd ?\n");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^SYSTEM\s*$/.test(l)), null, { timeout: 60_000 });
  await page.keyboard.type("cd a:system\n");
  await page.waitForFunction(() => /A: SYSTEM/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  await page.keyboard.type("shell.svc\n");
  await shellPrompt();
  assert.equal(await page.locator("#drive").inputValue(), "A", "transient unmount must not switch the file selector to B");
  const rows = page.locator("#filelist tbody tr");
  await rows.filter({ hasText: "HELLO3.ASM" }).waitFor({ timeout: 60_000 });
  assert.equal(await rows.filter({ hasText: "HELLO3.BIN" }).count(), 0, "the new starter supplies the source only");
  assert.deepEqual(errors, []);
  await context.close();
});
