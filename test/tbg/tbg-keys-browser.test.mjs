// Drive TBG's Code, Enter, G, Esc, F5 to a line, F6 to F8 and help keys on
// the standard card in Chromium. Run with node --test test/tbg/*.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../../tec-os/tools/lib/cpmfs.mjs";
import { card } from "../lib/page.mjs";
import { fromTecos } from "../lib/root.mjs";
import { open, serve } from "../lib/serve.mjs";

test("TBG's Code, stepping and help keys work on the standard card", { timeout: 180_000 }, async (t) => {
  const image = await card();
  const volume = findVolume(parseContainer(image), "A");
  const disk = new CpmVolume(volumePayload(image, volume), volume.g, { readOnly: false });
  disk.write("OVER.COM", Buffer.from("CD1001AFC41001CC10010E0CCD0500C9C9", "hex"));
  disk.write("STARTUP.CMD", Buffer.from("\r\n\x1a")); // No GLCD console.
  disk.write("REC.COM", Buffer.from("3E03CD0601C93DC8CD0601C9", "hex"));
  const server = await serve();
  t.after(() => server.close());
  const browser = await fromTecos("playwright").chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const { page, errors } = await open(browser, url, image, "tms", "40");
  const text = () => page.locator("#lcd").textContent();
  const lcd = (s) => page.waitForFunction((x) => document.getElementById("lcd").textContent.includes(x), s, { timeout: 15000 })
    .catch(async (e) => { throw new Error(`waiting for ${JSON.stringify(s)}; LCD: ${JSON.stringify(await text())}`, { cause: e }); });
  const prompt = () => page.waitForFunction(() => /^A(:[A-Z0-9]+)?>\s*$/.test(globalThis.tecos?.screen().filter((l) => l.trim()).at(-1) ?? ""), null, { timeout: 15000 });
  const key = async (name) => {
    await page.keyboard.press(name, { delay: 100 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A:?[A-Z]*>\s*$/.test(l)), null, { timeout: 15000 });
  await page.focus("#tms");
  await page.keyboard.type("unload\n");
  await prompt();
  await page.keyboard.type("tbg.svc over\n", { delay: 80 });
  await lcd("PC 0100");
  await page.locator("#lcd").click();
  await key("Tab");
  await lcd(">→0100 CALL 0110");
  await key("Enter"); // Enter follows the call.
  await lcd("> 0110 RET");
  await key("Escape");
  await lcd(">→0100 CALL 0110");
  await key("g");
  await lcd("Go to addr: _");
  for (const ch of "107") await key(ch);
  await key("Enter");
  await lcd("> 0107 CALL Z,0110");
  await key("F5"); // F5 runs to the selected line.
  await lcd(">→0107 CALL Z,0110");
  await key("F7"); // F7: over the taken call.
  await lcd(">→010A LD C,0C");
  await key("Shift+Tab");
  await lcd("PC 010A");
  await key("h");
  await lcd("REGISTERS   HELP 1/5");
  for (let i = 0; i < 3; i += 1) await key("ArrowRight");
  await lcd("RUNNING     HELP 4/5");
  assert.match(await text(), /Ctrl\+Esc held breaks/);
  await key("Escape");
  await lcd("PC 010A");
  for (let i = 0; i < 3 && !(await text()).includes("Quit TBG? Y/N"); i += 1) await key("Escape");
  await lcd("Quit TBG? Y/N");
  await key("y");
  await page.focus("#tms");
  await prompt();
  await page.keyboard.type("tbg.svc rec\n", { delay: 80 });
  await lcd("PC 0100");
  await page.locator("#lcd").click();
  for (let i = 0; i < 5; i += 1) await key("F8");
  await lcd("PC 0106");
  await key("F6"); // F6: step out, past the recursion.
  await lcd("Steps 0004");
  await lcd("PC 010B");
  assert.deepEqual(errors, []);
});
