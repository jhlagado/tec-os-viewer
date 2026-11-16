// A text file from the PC, with LF line
// ends, copied to A: with the page's
// default Copy as setting goes on as
// CP/M text, and TED opens it cleanly.
// Download in the same setting gives a
// text file back with LF line ends and
// no ^Z, and a service file byte for byte.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findVolume, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { card, web } from "./lib/page.mjs";
import { ROOT, fromTecos } from "./lib/root.mjs";
import { open, serve } from "./lib/serve.mjs";

const SOURCE = "; SNAKE0.Z80\n        ORG  0100H\nSTART:  LD   C,9\n        LD   DE,MSG\n        CALL 5\n        RET\nMSG:    DB   \"SNAKE$\"\n";

/** Read the full IndexedDB card through a binary download. */
async function storedCard(page) {
  const [download, snapshot] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => new Promise((ok, no) => {
      const request = indexedDB.open("tecos", 1);
      request.onerror = () => no(request.error);
      request.onsuccess = () => {
        const db = request.result;
        let get;
        try { get = db.transaction("cards").objectStore("cards").get("current"); }
        catch (error) { db.close(); no(error); return; }
        get.onerror = () => { db.close(); no(get.error); };
        get.onsuccess = async () => {
          try {
            const bytes = new Uint8Array(get.result);
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
            const sha256 = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
            const url = URL.createObjectURL(new Blob([bytes]));
            const link = document.createElement("a");
            link.href = url;
            link.download = "stored-card.img";
            link.click();
            ok({ url, bytes: bytes.length, sha256 });
          } catch (error) { no(error); }
          finally { db.close(); }
        };
      };
    })),
  ]);
  try {
    assert.equal(download.suggestedFilename(), "stored-card.img");
    const bytes = new Uint8Array(readFileSync(await download.path()));
    assert.equal(bytes.length, snapshot.bytes, "all IndexedDB bytes transferred");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), snapshot.sha256, "the binary download matches IndexedDB");
    return bytes;
  } finally {
    await page.evaluate(url => URL.revokeObjectURL(url), snapshot.url);
  }
}

function observeCopyImport() {
  const probe = window.copyImportProbe = { facts: [], dropped: 0, armed: false };
  const text = id => document.getElementById(id)?.textContent ?? null;
  probe.capture = phase => {
    const fact = { phase, at: performance.now(), problem: text("cardproblem"),
      browser: text("browserstatus"), guest: text("gueststatus"), card: text("cardinfo"),
      availability: text("copyavailability"),
      drive: document.getElementById("drive")?.value ?? null,
      inputDisabled: document.getElementById("putfile")?.disabled ?? null,
      rowVisible: [...document.querySelectorAll("#filelist tbody tr")].some(row => row.textContent.includes("SNAKE0.Z80")),
      screen: globalThis.tecos?.screen() ?? [] };
    if (probe.facts.length < 32) probe.facts.push(fact);
    else probe.dropped++;
    return fact;
  };
  document.addEventListener("change", event => {
    if (event.target.id !== "putfile") return;
    probe.armed = true;
    probe.capture("file change capture");
  }, true);
  document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => { if (probe.armed) probe.capture("file status changed"); });
    for (const id of ["cardproblem", "filelist"]) {
      observer.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true });
    }
  }, { once: true });
}

async function copyWithEvidence(page, errors, payload) {
  let primary = null, stageSuccess = false;
  try {
    await page.waitForFunction(({ name, type, text }) => {
      const input = document.getElementById("putfile");
      if (input.disabled || !document.getElementById("copyavailability").textContent.startsWith("Copy available")
        || !globalThis.tecos?.screen().some(line => /^A:SYSTEM>\s*$/.test(line))) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, { name: payload.name, type: payload.mimeType, text: payload.buffer.toString("utf8") }, { timeout: 60_000 });
    await page.evaluate(() => window.copyImportProbe.capture("after file selection"));
    await page.locator("#filelist tbody tr", { hasText: "SNAKE0.Z80" }).waitFor({ timeout: 60_000 });
    stageSuccess = true;
  } catch (error) { primary = error; throw error; }
  finally {
    let record = null, captureError = null, writeError = null, logError = null;
    const dir = process.env.TEST_EVIDENCE_DIR;
    try {
      record = await page.evaluate(() => {
        const final = window.copyImportProbe.capture("final import stage");
        const { facts, dropped } = window.copyImportProbe;
        return { case: "copy-import-observation", facts, dropped, final };
      });
      if (dir) {
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: join(dir, "copy-import.png"), fullPage: true });
      }
    } catch (error) { captureError = error.message; }
    record = { ...(record ?? { case: "copy-import-observation", facts: [], dropped: 0 }),
      stageSuccess, captureError, pageErrors: [...errors],
      scope: "import stage only; later stored-card and TED assertions are separate" };
    try { if (dir) writeFileSync(join(dir, "copy-import.json"), JSON.stringify(record, null, 2) + "\n"); }
    catch (error) { writeError = error.message; }
    try { console.log(JSON.stringify({ ...record, writeError })); }
    catch (error) { logError = error.message; }
    if (!primary && (captureError || writeError || logError)) throw Error(`Copy evidence failed: ${captureError ?? writeError ?? logError}`);
  }
}

test("an LF .z80 file copied with the default setting opens in TED with no EDIT error", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const original = await card();
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, original, "tms", "40", {
    setup: context => context.addInitScript(observeCopyImport),
  });
  const screen = () => page.evaluate(() => globalThis.tecos.screen().map((l) => l.trimEnd()));
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A:SYSTEM>\s*$/.test(l)), null, { timeout: 60_000 });
  assert.equal(await page.inputValue("#textmode"), "auto", "the default is text or binary, by file");

  await copyWithEvidence(page, errors, { name: "snake0.z80", mimeType: "application/octet-stream", buffer: Buffer.from(SOURCE) });
  const image = await storedCard(page);
  assert.equal(image.length, original.length, "the complete stored card");
  const v = findVolume(parseContainer(image), "A");
  const stored = Buffer.from(new CpmVolume(volumePayload(image, v), v.g).read("SNAKE0.Z80"));
  const crlf = Buffer.from(SOURCE.replace(/\n/g, "\r\n") + "\x1a");
  assert.deepEqual(stored.subarray(0, crlf.length), crlf, "CRLF line ends and ^Z on the card");
  assert.ok(stored.subarray(crlf.length).every((b) => b === 0x1a), "the record padded with ^Z, not 00h");

  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^A:SYSTEM>\s*$/.test(l)), null, { timeout: 60_000 });
  await page.click("#tms");
  await page.keyboard.type("ted snake0.z80\n", { delay: 20 });
  await page.waitForFunction(() => globalThis.tecos.screen().some((l) => /^TED +SNAKE0\.Z80 +L1 C1/.test(l)) || globalThis.tecos.screen().some((l) => /EDIT error/.test(l)), null, { timeout: 60_000 });
  const lines = await screen();
  assert.ok(!lines.some((l) => /EDIT error/.test(l)), `no EDIT error:\n${lines.join("\n")}`);
  assert.equal(lines[0], "; SNAKE0.Z80", `the file's first line at the top:\n${lines.join("\n")}`);
  assert.ok(lines.includes('MSG:    DB   "SNAKE$"'), "its last line");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Download in the default setting gives TIMES.BAS back as LF text and MON3.SVC byte for byte", { timeout: 180_000 }, async (t) => {
  web();
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { context, page, errors } = await open(browser, `http://127.0.0.1:${server.address().port}/`, await card(), "tms", "40");
  assert.equal(await page.inputValue("#textmode"), "auto", "the default is text or binary, by file");
  /** The bytes Download gives for NAME. */
  const download = async (name) => {
    const row = page.locator("#filelist tbody tr", { hasText: name });
    await row.waitFor({ timeout: 60_000 });
    const [d] = await Promise.all([page.waitForEvent("download"), row.locator("button").click()]);
    assert.equal(d.suggestedFilename(), name);
    return readFileSync(await d.path());
  };
  const times = await download("TIMES.BAS");
  assert.deepEqual(times, readFileSync(resolve(ROOT, "tec-os/programs/TIMES.BAS")), "TIMES.BAS as its LF source, with no CR and no ^Z");
  const binary = await download("MON3.SVC");
  const pinned = readFileSync(resolve(ROOT, "dist/files/MON3.SVC"));
  assert.deepEqual(binary.subarray(0, pinned.length), pinned, "MON3.SVC byte for byte");
  assert.ok(binary.length % 128 === 0 && binary.length - pinned.length < 128 && binary.subarray(pinned.length).every((b) => b === 0), "then only its last record's 00h padding");
  assert.deepEqual(errors, []);
  await context.close();
});
