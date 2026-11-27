// The page has one keyboard, as the TEC-1G has one matrix. Two faults it
// fixes, run on the standard card in Chromium with TBUG:
// - a key typed with the screen focused while TBUG has the program stopped
//   used to stay down, because nothing but TEC-OS's own scan let it go, so
//   one arrow ran Code's selection on by itself;
// - after quitting TBUG with the LCD focused, keys typed at normal speed
//   used to be lost, because the LCD pressed and released the matrix in
//   real time, one key at a time.
// Run with node --test test/tbg/*.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findVolume, parseContainer, volumePayload } from "../../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../../tec-os/tools/lib/cpmfs.mjs";
import { card } from "../lib/page.mjs";
import { fromTecos } from "../lib/root.mjs";
import { open, serve } from "../lib/serve.mjs";

/** The page with TBUG stopped at NOPS.COM's entry, its program forty NOPs and a RET. */
async function stopped(t) {
  const image = await card();
  const volume = findVolume(parseContainer(image), "A");
  const disk = new CpmVolume(volumePayload(image, volume), volume.g, { readOnly: false });
  disk.write("NOPS.COM", Buffer.concat([Buffer.alloc(40, 0), Buffer.from("C9", "hex")]));
  disk.write("STARTUP.CMD", Buffer.from("\r\n\x1a")); // No GLCD console.
  const server = await serve();
  t.after(() => server.close());
  const browser = await fromTecos("playwright").chromium.launch();
  t.after(() => browser.close());
  const { page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, image, "tms", "40");
  const lcd = () => page.locator("#lcd").textContent();
  const screen = () => page.evaluate(() => globalThis.tecos.screen().filter((l) => l.trim()));
  const prompt = () => page.waitForFunction(() => /^A(:[A-Z0-9]+)?>\s*$/.test(globalThis.tecos?.screen().filter((l) => l.trim()).at(-1) ?? ""), null, { timeout: 15000 });
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A:?[A-Z]*>\s*$/.test(l)), null, { timeout: 15000 });
  await page.focus("#tms");
  await page.keyboard.type("unload\n");
  await prompt();
  await page.keyboard.type("tbug.svc nops\n", { delay: 80 });
  await page.waitForFunction(() => document.getElementById("lcd").textContent.includes("TBUG Tab Next H Help"), null, { timeout: 15000 });
  await page.waitForTimeout(1500); // The hint goes.
  return { page, errors, lcd, screen, prompt };
}

test("one arrow typed with the screen focused moves TBUG's Code selection once", { timeout: 120_000 }, async (t) => {
  const { page, errors, lcd } = await stopped(t);
  await page.focus("#tms"); // The screen, not the LCD.
  await page.keyboard.press("c", { delay: 100 }); // Code.
  await page.waitForFunction(() => document.getElementById("lcd").textContent.includes(">→0100 NOP"), null, { timeout: 15000 });
  await page.waitForTimeout(1200); // The title goes.
  await page.keyboard.press("ArrowDown", { delay: 100 });
  await page.waitForTimeout(3000); // Long enough for a key left down to run on.
  const text = await lcd();
  assert.match(text, /> 0101 NOP/, `one row down: ${JSON.stringify(text)}`);
  assert.deepEqual(errors, []);
});

test("after quitting TBUG with the LCD focused, keys typed quickly reach the prompt", { timeout: 120_000 }, async (t) => {
  const { page, errors, screen, prompt } = await stopped(t);
  await page.locator("#lcd").click(); // The LCD, as when driving TBUG.
  await page.keyboard.press("q", { delay: 100 });
  await page.waitForFunction(() => document.getElementById("lcd").textContent.includes("Quit TBUG? Y/N"), null, { timeout: 15000 });
  await page.keyboard.press("y", { delay: 100 });
  await prompt();
  await page.keyboard.type("dir a:\n"); // No delay: keys overlap as in fast typing.
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /DIR A:/i.test(l)), null, { timeout: 15000 })
    .catch(async (e) => { throw new Error(`the typed line: ${JSON.stringify(await screen())}`, { cause: e }); });
  await prompt();
  assert.ok((await screen()).some((l) => /TBUG\.SVC/.test(l)), "DIR ran and listed A:");
  assert.deepEqual(errors, []);
});
