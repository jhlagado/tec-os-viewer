// VG5: a card kept in the page's store from an older TEC-OS, in Chromium. One
// with PICO.SVC and its startup line, at 40 columns, boots to A> with that line
// gone and CON PICO 40 first in STARTUP.CMD, and is stored so. One with .DRV
// files is refused in card.mjs's words. The reference is the same two cards
// through prepareCard and cardProblem in Node. Needs npm run tecos first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { cardProblem } from "../tec-os/host/card.mjs";
import { card, prepareCard, web } from "./lib/page.mjs";
import { fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const startupFile = (...lines) => Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1");
const driveA = (image) => {
  const v = findVolume(parseContainer(image), "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
};
const startup = (image) => Buffer.from(driveA(image).read("STARTUP.CMD", { text: true })).toString("latin1");

/** The page's card as an older TEC-OS left it: PICO.SVC on A: and first in STARTUP.CMD. */
async function picoSvcCard() {
  const image = await card();
  const a = driveA(image);
  a.write("PICO.SVC", Uint8Array.of(0xc9));
  a.write("STARTUP.CMD", startupFile("PICO.SVC", "USER 0"));
  return image;
}

/** The page's card from before the drivers were services: GLCD.DRV and PICO.DRV, and no GLCD.SVC. */
async function driverCard() {
  const image = await card();
  const a = driveA(image);
  a.erase("GLCD.SVC");
  a.write("GLCD.DRV", Uint8Array.of(0xc9));
  a.write("PICO.DRV", Uint8Array.of(0xc9));
  a.write("STARTUP.CMD", startupFile("GLCD.DRV"));
  return image;
}

/** The SHA-256 of the page's stored card. */
const storedSha = (page) =>
  page.evaluate(
    () =>
      new Promise((ok) => {
        const r = indexedDB.open("tecos", 1);
        r.onsuccess = () => {
          const get = r.result.transaction("cards").objectStore("cards").get("current");
          get.onsuccess = async () => {
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", get.result));
            r.result.close();
            ok(Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""));
          };
        };
      }),
  );

test("stored cards of older ROMs: PICO.SVC's card is upgraded at 40 columns, and a .DRV card is refused in card.mjs's words", { timeout: 120_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/`;

  // The reference: the same card through prepareCard in Node.
  const old = await picoSvcCard();
  const want = old.slice();
  assert.equal(prepareCard(want, "tms", "40").problem, null);
  assert.equal(startup(want), "CON PICO 40\nUSER 0\n", "Node's reading: the PICO.SVC line gone, CON PICO 40 first");

  const upgraded = await open(browser, url, old, "tms", "40");
  await upgraded.page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
  const rows = await upgraded.page.evaluate(() => globalThis.tecos.screen());
  // CON PICO 40 clears the screen as it takes the console; what follows is on it.
  assert.ok(rows.some((l) => /^A>USER 0\s*$/.test(l)), `the startup file's other line ran:\n${rows.join("\n")}`);
  assert.ok(!rows.some((l) => /PICO\.SVC/.test(l)), `and not PICO.SVC's:\n${rows.join("\n")}`);
  await upgraded.page.waitForFunction(() => !/not saved/.test(document.getElementById("cardinfo").textContent), null, { timeout: 30_000 });
  const stored = async () => (await storedSha(upgraded.page)) === sha(want);
  for (let i = 0; i < 20 && !(await stored()); i += 1) await upgraded.page.waitForTimeout(500);
  assert.ok(await stored(), "the stored card is Node's prepared card, byte for byte");
  assert.deepEqual(upgraded.errors, []);
  await upgraded.context.close();

  const drv = await driverCard();
  const words = cardProblem(drv, "glcd");
  assert.match(words ?? "", /older TEC-OS: this ROM doesn't load GLCD\.DRV/, "Node's reading");
  const refused = await open(browser, url, drv, "glcd", "80");
  await refused.page.waitForFunction((w) => document.getElementById("serial").textContent.includes(`[${w}]`), words, { timeout: 60_000 });
  assert.deepEqual(refused.errors, []);
  await refused.context.close();
});
