// KE-125: route touch-keyboard edits to
// the PICO9918 screen in Chromium at a
// phone-sized viewport. Tap the canvas,
// then enter dir through beforeinput
// and input on the focused text field.
// Do not inject canvas keydown events.
// Check the resulting directory output.
// Run npm run tecos before this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ROOT, fromTecos } from "./lib/root.mjs";
import { serve } from "./lib/serve.mjs";

/**
 * Simulate text-field keyboard edits.
 * Dispatch beforeinput per character.
 * Unless cancelled, update the value
 * and dispatch input. "\n" means Enter.
 */
function phoneType(text) {
  const el = document.activeElement;
  for (const ch of text) {
    const inputType = ch === "\n" ? "insertLineBreak" : "insertText";
    const data = ch === "\n" ? null : ch;
    const before = new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true });
    if (!el.dispatchEvent(before)) continue;
    const at = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, el.selectionStart ?? at) + ch + el.value.slice(at);
    el.selectionStart = el.selectionEnd = at + 1;
    el.dispatchEvent(new InputEvent("input", { inputType, data, bubbles: true }));
  }
}

test("on a phone, tapping the screen and typing dir on the phone's keyboard lists the directory", async (t) => {
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.getElementById("serial").textContent.includes("[power on]"), null, { timeout: 30_000 });

  await page.tap("#tms");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, id: el?.id, autocorrect: el?.getAttribute("autocorrect"), autocapitalize: el?.getAttribute("autocapitalize"), spellcheck: el?.spellcheck };
  });
  assert.ok(
    focused.tag === "TEXTAREA" || focused.tag === "INPUT",
    `tapping the screen focused ${focused.tag}#${focused.id}, not a text field, so no phone keyboard comes up`,
  );
  assert.deepEqual([focused.autocorrect, focused.autocapitalize, focused.spellcheck], ["off", "off", false], "autocorrect, autocapitalise and spellcheck are off");
  assert.ok(await page.isVisible("#touchkeys"), "the row of keys a phone keyboard lacks is shown");

  // Read the running machine's screen
  // through the page's test hook.
  const screen = () => page.evaluate(() => globalThis.tecos.screen());
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>$/.test(l)), null, { timeout: 60_000 });

  await page.evaluate(phoneType, "dir\n");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^\d+ files, \d+K free$/.test(l)), null, { timeout: 60_000 }).catch(() => {});
  const lines = await screen();
  const at = lines.indexOf("A>dir");
  assert.ok(at >= 0, `the typed command is on the screen:\n${lines.join("\n")}`);
  assert.match(lines[at + 1] ?? "", /^MOUNT\.COM +GLCD\.SVC/, `the directory follows it:\n${lines.join("\n")}`);
  assert.ok(lines.slice(at).some((l) => /^\d+ files, \d+K free$/.test(l)), `the directory's count follows it:\n${lines.join("\n")}`);
  assert.deepEqual(errors, []);
});
