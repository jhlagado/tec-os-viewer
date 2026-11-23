// Set TBG_SVC to the Thorium build. Set TBG_ROM to an experimental
// TEC-OS ROM to exercise the armed shell launch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRecipe } from "../tec-os/tools/lib/recipe.mjs";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

test("TBG launches, steps and resumes in the Viewer", { skip: !process.env.TBG_SVC && !process.env.TBG_PREVIEW, timeout: 90_000 }, async (t) => {
  const packaged = process.env.TBG_PREVIEW && resolve(process.env.TBG_PREVIEW);
  const image = packaged
    ? await buildRecipe(JSON.parse(readFileSync(resolve(packaged, "starter.recipe.json"), "utf8")),
      (url) => readFileSync(resolve(packaged, url)))
    : await card();
  const volume = findVolume(parseContainer(image), "A");
  const disk = new CpmVolume(volumePayload(image, volume), volume.g, { readOnly: false });
  if (!packaged) {
    disk.write("TBG.SVC", readFileSync(process.env.TBG_SVC));
    const program = Uint8Array.of(0x21, 0x34, 0x12, 0xe5, 0xd1, 0xc9);
    disk.write("STEP.COM", program);
    const sidecar = Buffer.alloc(256);
    sidecar.writeUInt16LE(1600, 0); // Label A.
    sidecar[5] = 0x50;
    sidecar.writeUInt16LE(0x104, 6);
    sidecar.write("TDBG", 128);
    sidecar[132] = 2;
    sidecar.writeUInt16LE(0x100, 134);
    sidecar.writeUInt16LE(0x100 + program.length, 136);
    sidecar.writeUInt16LE(program.reduce((sum, byte) => sum + byte, 0), 138);
    sidecar.writeUInt16LE(1, 142);
    disk.write("STEP.TBG", sidecar);
    disk.write("STARTUP.CMD", Buffer.from("\r\n\x1a"));
  }
  // BDOS 10 reads a line, then BDOS 9 prints it once after RESULT=.
  disk.write("LINE.COM", Buffer.from(
    "112f010e0acd05003a30015f16002131011936241125010e09cd05001131010e09cd0500c90d0a524553554c543d2408000000000000000000",
    "hex",
  ));
  const server = await serve(packaged || undefined);
  t.after(() => server.close());
  const browser = await fromTecos("playwright").chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const armed = Boolean(packaged || process.env.TBG_ROM);
  const setup = !packaged && armed ? async (context) => {
    const rom = readFileSync(process.env.TBG_ROM);
    await context.route(`${url}roms/tecos.rom`, (route) => route.fulfill({ body: rom }));
  } : undefined;
  const { page, errors } = await open(browser, url, image, "tms", "40", { setup, namespace: packaged ? "tecos-tbg-preview" : "tecos" });
  const lcd = (text) => page.waitForFunction((s) => document.getElementById("lcd").textContent.includes(s), text, { timeout: 12000 });
  const prompt = (command = "") => page.waitForFunction((expected) => {
    const lines = globalThis.tecos?.screen().filter((line) => line.trim()) ?? [];
    return /^A>\s*$/.test(lines.at(-1) ?? "")
      && (!expected || lines.at(-2)?.toLowerCase().endsWith(expected));
  }, command, { timeout: 12000 });
  await page.waitForFunction(() => globalThis.tecos?.screen().some((line) => /^A:?[A-Z]*>\s*$/.test(line)), null, { timeout: 12000 });
  await page.focus("#tms");
  // Release the shell before allocating the resident debugger.
  await page.keyboard.type("unload\n");
  await prompt();
  if (packaged) {
    await page.keyboard.type("tas step\n", { delay: 80 });
    await page.waitForFunction(() => {
      const lines = globalThis.tecos.screen().filter((line) => line.trim());
      return /^A>\s*$/.test(lines.at(-1)) && lines.some((line) => /STEP.COM written/.test(line));
    }, null, { timeout: 12000 });
  }
  if (armed) {
    await page.keyboard.type("tbg.svc arm\n");
    await prompt("tbg.svc arm");
  }
  await page.focus("#tms");
  await page.keyboard.type(armed ? "step\n" : "tbg.svc step\n", { delay: 80 });
  await lcd("PC: 0100SY").catch(async (error) => {
    throw new Error(`Entry stop missing. LCD: ${await page.locator("#lcd").textContent()}\n${await page.evaluate(() => globalThis.tecos.screen())}`, { cause: error });
  });
  await page.locator("#lcd").click();
  const video = () => page.locator("#tms").evaluate((canvas) => canvas.toDataURL());
  const videoAtEntry = await video();
  const key = async (name) => {
    await page.keyboard.press(name, { delay: 100 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await key("Space"); // Space steps, as S does.
  await lcd("PC: 0103");
  await key("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "lcd", "Tab stays on the LCD");
  await lcd(">@0103 PUSH HL");
  await key("Shift+Tab"); // Registers,
  await key("Shift+Tab"); // then Symbols.
  if (packaged) {
    await lcd("0100   START");
    await key("ArrowDown");
  }
  await lcd(packaged ? "0104   TAKE" : "0104   A");
  await key("b");
  await lcd(packaged ? "0104 * TAKE" : "0104 * A");
  await key("Tab"); // Registers,
  await key("Tab"); // then Code.
  await lcd(">@0103 PUSH");
  await key("ArrowDown");
  await lcd(">*0104 POP");
  await key("Shift+Tab"); // Registers.
  await key("r");
  await lcd("PC: 0104");
  assert.match(await page.locator("#lcd").textContent(), /^PC: 0104.*BP/m);
  for (let i = 0; i < 3; i += 1) await key("Tab"); // Code, Stack, Memory.
  await lcd("0104: D1 C9");
  await key("ArrowDown");
  await lcd("0108:");
  await key("ArrowUp");
  await lcd("0104: D1 C9");
  await key("ArrowRight");
  assert.match(await page.locator("#lcd").textContent(), /^[0-9A-F]{4}: 34 12 .*SP$/m);
  await key("ArrowRight");
  await lcd("1234:");
  await key("Tab"); // Symbols,
  await key("Tab"); // then Registers.
  await lcd("PC: 0104");
  await key("Control+Space"); // Kept for Step Out: Ctrl must reach TBG, or this would step.
  await page.waitForTimeout(500);
  assert.match(await page.locator("#lcd").textContent(), /^PC: 0104/m);
  await key("Tab"); // Code,
  await key("Tab"); // then Stack.
  await lcd("SP>");
  await key("Shift+Space"); // Step Over, which is a step on POP.
  await key("Shift+Tab"); // Code, following PC.
  await lcd(">@0105 RET");
  await key("r");
  await lcd("EX");
  assert.equal(await video(), videoAtEntry, "debugging kept the rendered 9918 display intact");
  await key("q");
  await lcd("Quit? Enter yes");
  await key("Enter");
  await prompt();
  await page.locator("#lcd").click();
  await page.keyboard.press("F6");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "tms", "F6 leaves the LCD for the screen");
  if (armed) {
    await page.focus("#tms");
    await page.keyboard.type("tbg.svc line\n", { delay: 80 });
    await lcd("PC: 0100");
    await page.locator("#lcd").click();
    await key("r");
    await page.focus("#tms");
    await page.keyboard.type("AB", { delay: 100 });
    await page.waitForFunction(() => globalThis.tecos.screen().some((line) => /^AB\s*$/.test(line)), null, { timeout: 12000 });
    await key("Control+x");
    await lcd("INPUT PAUSED");
    await page.locator("#lcd").click();
    await key("w");
    await lcd("Saved TBGSTATE.BIN");
    await key("r");
    await page.focus("#tms");
    await page.keyboard.type("C\n", { delay: 100 });
    await page.waitForFunction(() => globalThis.tecos.screen().some((line) => /^RESULT=ABC\s*$/.test(line)), null, { timeout: 12000 });
    await lcd("EX");
    assert.equal((await page.evaluate(() => globalThis.tecos.screen())).filter((line) => line.includes("RESULT=")).length, 1);
  }
  if (packaged) {
    const databases = await page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name));
    assert.deepEqual(databases, ["tecos-tbg-preview"], "the preview only opens its own card storage");
  }
  assert.deepEqual(errors, []);
});
