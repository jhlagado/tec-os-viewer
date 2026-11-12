// Load older cards in Chromium. Replace
// PICO.SVC and its startup line with
// CON PICO 40 after SHELL.SVC's, then
// check A> and the stored image. Reject
// .DRV cards. A card stored before the
// shell gets the starter card's
// SHELL.SVC and MON3.SVC and keeps the
// user's files; the page shows the
// note, and SERVICES lists the shell.
// With A:'s directory full the shell
// isn't added and the note says so;
// with no starter card to fetch the
// note says the next power-on tries
// again. Compare each with the shared
// Node card helpers. Run npm run tecos
// first.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContainer, findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { cardProblem } from "../tec-os/host/card.mjs";
import { card, prepareCard, web } from "./lib/page.mjs";
import { ROOT, fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const startupFile = (...lines) => Buffer.from(lines.map((l) => `${l}\r\n`).join("") + "\x1a", "latin1");
const driveA = (image) => {
  const v = findVolume(parseContainer(image), "A");
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
};
const startup = (image) => Buffer.from(driveA(image).read("STARTUP.CMD", { text: true })).toString("latin1");

/** Make a card with PICO.SVC startup. */
async function picoSvcCard() {
  const image = await card();
  const a = driveA(image);
  a.write("PICO.SVC", Uint8Array.of(0xc9));
  a.write("STARTUP.CMD", startupFile("PICO.SVC", "USER 0"));
  return image;
}

/**
 * Make a pre-service card with GLCD.DRV
 * and PICO.DRV instead of GLCD.SVC.
 */
async function driverCard() {
  const image = await card();
  const a = driveA(image);
  a.erase("GLCD.SVC");
  a.write("GLCD.DRV", Uint8Array.of(0xc9));
  a.write("PICO.DRV", Uint8Array.of(0xc9));
  a.write("STARTUP.CMD", startupFile("GLCD.DRV"));
  return image;
}

/** A: or B: on IMAGE. */
const drive = (image, name) => {
  const v = findVolume(parseContainer(image), name);
  return new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
};

/** Each file on IMAGE's drive NAME and its SHA-256. */
const filesOf = (image, name) => Object.fromEntries(drive(image, name).list().map((f) => [f.name, sha(drive(image, name).read(f.name))]));

/** MON3.SVC as the card held it before the shell: it installs without being entered. */
const OLD_MON3 = JSON.parse(readFileSync(resolve(ROOT, "tec-os/test/fixtures/mon3-55f0171.json"), "utf8"));

/**
 * A card the page saved before the
 * shell, of that time's shape: two
 * volumes, SYSTEM on A: and WORK on B:,
 * with the starter's files of today on
 * A: but no SHELL.SVC, the old
 * MON3.SVC, the startup line the page
 * wrote for the PICO9918 at 40 columns,
 * and the user's own files on A: and
 * B:.
 */
async function preShellCard() {
  const today = await card();
  const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }, { geometry: "G8M", label: "WORK", mount: "B" }]);
  const a = driveA(image);
  for (const f of driveA(today).list()) if (f.name !== "SHELL.SVC") a.write(f.name, driveA(today).read(f.name));
  a.write("MON3.SVC", Buffer.from(OLD_MON3.file, "base64"));
  a.write("STARTUP.CMD", startupFile("CON PICO 40"));
  a.write("NOTES.TXT", Buffer.from("my own notes\r\n\x1a", "latin1"));
  a.write("SAMPLE.ASM", Buffer.from("; the user's own edit\r\n\x1a", "latin1"));
  drive(image, "B").write("WORK.TXT", Buffer.from("work\r\n\x1a", "latin1"));
  return image;
}

/** Hash the stored card with SHA-256. */
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
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;

  // Prepare the reference card in Node.
  const old = await picoSvcCard();
  const want = old.slice();
  assert.equal(prepareCard(want, "tms", "40").problem, null);
  assert.equal(startup(want), "SHELL.SVC\nCON PICO 40\nUSER 0\n", "Node's reading: the PICO.SVC line gone, SHELL.SVC then CON PICO 40 first");

  const upgraded = await open(browser, url, old, "tms", "40");
  // The shell runs the startup file's
  // lines in turn, each after its own
  // prompt, so wait for the prompt
  // after the last of them.
  await upgraded.page.waitForFunction(() => {
    const rows = globalThis.tecos?.screen() ?? [];
    const at = rows.findIndex((l) => /^A:SYSTEM>USER 0\s*$/.test(l));
    return at >= 0 && rows.slice(at + 1).some((l) => /^A:SYSTEM>\s*$/.test(l));
  }, null, { timeout: 60_000 });
  const rows = await upgraded.page.evaluate(() => globalThis.tecos.screen());
  // Width selection clears the screen.
  // Later startup output remains visible.
  assert.ok(rows.some((l) => /^A:SYSTEM>USER 0\s*$/.test(l)), `the startup file's other line ran:\n${rows.join("\n")}`);
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

test("a card stored before the shell is given the starter's SHELL.SVC and MON3.SVC, keeps the user's files, says so, and boots with the shell", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;

  const old = await preShellCard();
  assert.equal(OLD_MON3.sha256, sha(Buffer.from(OLD_MON3.file, "base64")), "the fixture's MON3.SVC");
  const userFiles = (image) => {
    const { "SHELL.SVC": _s, "MON3.SVC": _m, "STARTUP.CMD": _c, ...rest } = filesOf(image, "A");
    return { A: rest, B: filesOf(image, "B") };
  };
  // What the page should store: Node's
  // reading with the starter card.
  const starter = await card();
  const want = old.slice();
  const prepared = prepareCard(want, "tms", "40", starter);
  assert.equal(prepared.problem, null);
  assert.match(prepared.note ?? "", /^This card is from before the shell: the page gave it the starter card's SHELL\.SVC and MON3\.SVC/);
  for (const name of ["SHELL.SVC", "MON3.SVC"]) assert.equal(filesOf(want, "A")[name], filesOf(starter, "A")[name], `the starter's ${name}`);
  assert.equal(startup(want), "SHELL.SVC\nCON PICO 40\n");
  assert.deepEqual(userFiles(want), userFiles(old), "every other file on A: and B: as it was");

  const opened = await open(browser, url, old, "tms", "40");
  const { page } = opened;
  await page.waitForFunction((w) => document.getElementById("serial").textContent.includes(`[${w}]`), prepared.note, { timeout: 60_000 });
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A:SYSTEM>\s*$/.test(l)), null, { timeout: 60_000 });
  const stored = async () => (await storedSha(page)) === sha(want);
  for (let i = 0; i < 20 && !(await stored()); i += 1) await page.waitForTimeout(500);
  assert.ok(await stored(), "the stored card is Node's upgraded card, byte for byte");
  await page.focus("#tms");
  await page.keyboard.type("services\n");
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^SHELL\b/.test(l)), null, { timeout: 60_000 }).catch(() => {});
  const rows = await page.evaluate(() => globalThis.tecos.screen());
  assert.ok(rows.some((l) => /^SHELL\b/.test(l)), `SERVICES lists the shell:\n${rows.join("\n")}`);
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
});

/** Chromium, a server for the page and its URL, closed after T. */
async function browse(t) {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  return { browser, url: `http://127.0.0.1:${server.address().port}/` };
}

/** Wait until PAGE's serial pane shows NOTE in brackets, then for A>. */
async function noteThenPrompt(page, note) {
  await page.waitForFunction((w) => document.getElementById("serial").textContent.includes(`[${w}]`), note, { timeout: 60_000 });
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
}

test("a card stored before the shell whose A: directory is full boots without the shell, the page says the shell couldn't be added, and a power cycle tries again without fetching the starter card again", { timeout: 180_000 }, async (t) => {
  const { browser, url } = await browse(t);
  const old = await preShellCard();
  const a = driveA(old);
  let added = 0;
  for (;;) {
    try {
      a.write(`F${String(added).padStart(4, "0")}.TXT`, Uint8Array.of(0x1a));
      added += 1;
    } catch {
      break;
    }
  }
  assert.ok(added > 0, "files added until A:'s directory is full");
  const want = old.slice();
  const { note } = prepareCard(want, "tms", "40", await card());
  assert.match(note ?? "", /^This card is from before the shell, and the page couldn't add the shell to it/);
  assert.equal(drive(want, "A").find("SHELL.SVC"), undefined, "no SHELL.SVC written");
  let fetched = 0;
  const setup = (context) => context.route(`${url}starter.recipe.json`, (route) => ((fetched += 1), route.continue()));
  const opened = await open(browser, url, old, "tms", "40", { setup });
  await noteThenPrompt(opened.page, note);
  const stored = async () => (await storedSha(opened.page)) === sha(want);
  for (let i = 0; i < 20 && !(await stored()); i += 1) await opened.page.waitForTimeout(500);
  assert.ok(await stored(), "the stored card is Node's prepared card, byte for byte");
  // A power cycle tries again with the
  // starter card the page already has.
  const shown = await opened.page.evaluate(() => document.getElementById("serial").textContent.split(`[`).length);
  await opened.page.click("#power");
  await opened.page.waitForFunction((n) => document.getElementById("serial").textContent.split(`[`).length > n + 1, shown, { timeout: 60_000 });
  await noteThenPrompt(opened.page, note);
  assert.equal(fetched, 1, "the starter card fetched once");
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
});

test("a card stored before the shell boots without it when the starter card can't be fetched, and the page says the next power-on tries again", { timeout: 180_000 }, async (t) => {
  const { browser, url } = await browse(t);
  const old = await preShellCard();
  const setup = (context) => context.route(`${url}starter.recipe.json`, (route) => route.abort());
  const opened = await open(browser, url, old, "tms", "40", { setup });
  await noteThenPrompt(opened.page, "This card is from before the shell, and the page couldn't fetch the starter card to add the shell to it, so it boots without the shell. The next power-on tries again.");
  await opened.page.focus("#tms");
  await opened.page.keyboard.type("services\n");
  await opened.page.waitForFunction(() => globalThis.tecos.screen().some((l) => /SERVICES\?/.test(l)), null, { timeout: 60_000 });
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
});
