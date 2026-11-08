// VG6: boot the standalone HTML page
// with all other requests blocked.
// Check A> and both commit labels.
// Run npm run tecos before this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { web } from "./lib/page.mjs";
import { ROOT, fromTecos } from "./lib/root.mjs";

const commit = (dir) => execFileSync("git", ["-C", dir, "rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();

test("the single page boots to A> with no request but its own, and names both commits", { timeout: 120_000 }, async (t) => {
  web();
  execFileSync(process.execPath, [resolve(ROOT, "tools/page.mjs")], { stdio: "pipe" });
  const html = readFileSync(resolve(ROOT, "dist/tec-os-viewer.html"));
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const { chromium } = fromTecos("playwright");
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/tec-os-viewer.html`;
  const context = await browser.newContext();
  const refused = [];
  await context.route("**/*", (route) => (route.request().url() === url ? route.continue() : (refused.push(route.request().url()), route.abort())));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => globalThis.tecos?.screen().some((l) => /^A>\s*$/.test(l)), null, { timeout: 60_000 });
  const label = await page.textContent("h1 .sub:last-child");
  assert.equal(label, `built from tec-os-viewer ${commit(ROOT)} and tec-os ${commit(resolve(ROOT, "tec-os"))}`);
  assert.deepEqual(refused, [], "no request left the page");
  assert.deepEqual(errors, []);
});
