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

  await page.click("#power");
  await page.waitForFunction(() => /-: GAMES/.test(document.getElementById("cardinfo").textContent), null, { timeout: 60_000 });
  await prompt();
  assert.match(await line(), /A: SYSTEM .*B: WORK .*C: PROJECTS .*-: GAMES .*-: SPARE/, "the card's own drives after Power cycle");
  assert.deepEqual(errors, []);
  await context.close();
});
