// TBUG on the standard card: TAS assembles the book's STEP.ASM, TBUG STEP
// takes the launch through COMVEC (TEC-OS ABI 5.3), and STEP.TBG names
// its labels. The card's SYSTEM volume on A: carries TAS, TBUG.SVC and
// TBUG.HLP. Run with node --test test/tbg/*.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findVolume, parseContainer, volumePayload } from "../../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../../tec-os/tools/lib/cpmfs.mjs";
import { card } from "../lib/page.mjs";
import { fromTecos } from "../lib/root.mjs";
import { open, serve } from "../lib/serve.mjs";
import { bookSource } from "./book.mjs";

test("TBUG launches, steps and resumes in the Viewer", { timeout: 90_000 }, async (t) => {
  const image = await card();
  const volume = findVolume(parseContainer(image), "A");
  const disk = new CpmVolume(volumePayload(image, volume), volume.g, { readOnly: false });
  disk.write("STEP.ASM", bookSource("02-watch-the-stack.md"));
  disk.write("STARTUP.CMD", Buffer.from("\r\n\x1a")); // No GLCD console.
  // BDOS 10 reads a line, then BDOS 9 prints it once after RESULT=.
  disk.write("LINE.COM", Buffer.from(
    "112f010e0acd05003a30015f16002131011936241125010e09cd05001131010e09cd0500c90d0a524553554c543d2408000000000000000000",
    "hex",
  ));
  const server = await serve();
  t.after(() => server.close());
  const browser = await fromTecos("playwright").chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const { page, errors } = await open(browser, url, image, "tms", "40");
  const lcd = (text) => page.waitForFunction((s) => document.getElementById("lcd").textContent.includes(s), text, { timeout: 12000 }).catch(async (e) => { throw new Error(`LCD for ${text}: ${JSON.stringify(await page.locator("#lcd").textContent())}`, { cause: e }); });
  const prompt = (command = "") => page.waitForFunction((expected) => {
    const lines = globalThis.tecos?.screen().filter((line) => line.trim()) ?? [];
    return /^A(:[A-Z0-9]+)?>\s*$/.test(lines.at(-1) ?? "")
      && (!expected || lines.at(-2)?.toLowerCase().endsWith(expected));
  }, command, { timeout: 12000 });
  /** Wait for a first stop at 0100h: Registers or Code, whichever TBUG shows first. */
  const entry = () => page.waitForFunction(() => /PC 0100|→0100/.test(document.getElementById("lcd").textContent), null, { timeout: 15000 });
  await page.waitForFunction(() => globalThis.tecos?.screen().some((line) => /^A:?[A-Z]*>\s*$/.test(line)), null, { timeout: 12000 });
  await page.focus("#tms");
  // Release the shell before allocating the resident debugger.
  await page.keyboard.type("unload\n");
  await prompt();
  await page.keyboard.type("tas step\n", { delay: 80 });
  await page.waitForFunction(() => {
    const lines = globalThis.tecos.screen().filter((line) => line.trim());
    return /^A(:[A-Z0-9]+)?>\s*$/.test(lines.at(-1)) && lines.some((line) => /STEP.COM written/.test(line));
  }, null, { timeout: 12000 });
  await page.focus("#tms");
  await page.keyboard.type("tbug step\n", { delay: 80 });
  await entry().catch(async (error) => {
    throw new Error(`Entry stop missing. LCD: ${await page.locator("#lcd").textContent()}\n${await page.evaluate(() => globalThis.tecos.screen())}`, { cause: error });
  });
  await page.locator("#lcd").click();
  const video = () => page.locator("#tms").evaluate((canvas) => canvas.toDataURL());
  const videoAtEntry = await video();
  const key = async (name) => {
    await page.keyboard.press(name, { delay: 100 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  /** Press NAME and wait until the LCD shows its effect. */
  const keyThen = async (name) => {
    const before = await page.locator("#lcd").textContent();
    await key(name);
    await page.waitForFunction((b) => document.getElementById("lcd").textContent !== b, before, { timeout: 5000 });
  };
  await key("r"); // Registers, whichever view the first stop shows.
  await lcd("PC 0100");
  {
    await key("h"); // The card carries TBUG.HLP.
    await lcd("REGISTERS   HELP 1/5");
    await key("Escape");
    assert.match(await page.locator("#lcd").textContent(), /SY/, "STEP.TBG matched STEP.COM");
    await key("y"); // Symbols.
    await lcd(">0100 START");
    await lcd(" 0104 TAKE");
    await key("r"); // Registers again.
    await lcd("PC 0100");
  }
  await key("F8"); // F8, Fn+8: step into.
  await lcd("PC 0103");
  await key("c"); // Code.
  await lcd(">→0103 PUSH HL");
  await key("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "lcd", "Tab stays on the LCD");
  await key("Shift+Tab"); // And back to Code.
  await lcd(">→0103 PUSH HL");
  // Code keeps its window while PC stays in it, and a label row never
  // takes the bottom row, so put PC on the top row for TAKE:'s row.
  await key("g");
  for (const ch of "103") await key(ch);
  await key("Enter");
  await lcd("TAKE:"); // STEP.TBG's label row.
  await lcd(">→0103 PUSH HL");
  await key("ArrowDown");
  await key("Space"); // Space: a breakpoint.
  await lcd(">□0104 POP DE");
  await lcd("BP SET 0104");
  await key("ArrowLeft"); // The selection back on PC.
  await key("r"); // Registers.
  await key("F5"); // F5, Fn+5: run.
  await lcd("PC 0104");
  assert.match(await page.locator("#lcd").textContent(), /PC 0104.*BP/);
  await key("m"); // Memory.
  await lcd("0104>D1 C9");
  await key("ArrowDown");
  await lcd("0108>");
  await key("Control+ArrowDown"); // Ctrl must reach TBUG for a page.
  await lcd("0118>");
  {
    await key("y"); // Symbols, when STEP.TBG matches.
    await lcd(">0100 START");
  }
  await key("r"); // Registers.
  await lcd("PC 0104");
  await key("ArrowDown"); // AF,
  await key("ArrowDown"); // DE,
  await key("ArrowRight"); // then HL.
  await lcd(">HL 1234");
  await key("Enter"); // Memory following HL.
  await lcd("1234>");
  await key("Escape");
  await lcd(">HL 1234");
  await key("s"); // Stack.
  await lcd(">SP ");
  // Ctrl+Space steps out: POP and RET leave STEP. Were Ctrl lost, Space
  // would step POP and stop at 0105h instead.
  await key("F6"); // F6, Fn+6: step out.
  await lcd("EX");
  assert.equal(await video(), videoAtEntry, "debugging kept the rendered 9918 display intact");
  await keyThen("Escape"); // Back to the view before, then the question.
  if (!(await page.locator("#lcd").textContent()).includes("Quit TBUG? Y/N")) await keyThen("Escape");
  await lcd("Quit TBUG? Y/N");
  await key("y");
  await prompt();
  await page.locator("#lcd").click();
  await page.locator("#tms").click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "tms", "a click on the screen leaves the LCD");
  {
    await page.focus("#tms");
    await page.keyboard.type("tbug line\n", { delay: 80 });
    await entry(); // The first stop, in whichever view TBUG opens.
    await page.locator("#lcd").click();
    await key("F5"); // A line read under TBUG is the program's own.
    await page.focus("#tms");
    await page.keyboard.type("ABC\n", { delay: 100 });
    await page.waitForFunction(() => globalThis.tecos.screen().some((line) => /^RESULT=ABC\s*$/.test(line)), null, { timeout: 12000 });
    await lcd("EX");
    assert.equal((await page.evaluate(() => globalThis.tecos.screen())).filter((line) => line.includes("RESULT=")).length, 1);
  }
  assert.deepEqual(errors, []);
});
