// The Compact font's notices reach the
// page: FONT-NOTICES.txt beside it, the
// same bytes as TEC-OS's, and the escaped
// text inline in the page and standalone.
// Run npm run tecos before this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib/root.mjs";

const DIST = resolve(ROOT, "dist");
const escape = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

test("the font notices ship beside the page and inline in it", { timeout: 300_000 }, () => {
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  const source = readFileSync(resolve(ROOT, "tec-os/dist/FONT-NOTICES.txt"));
  assert.ok(source.equals(readFileSync(resolve(DIST, "FONT-NOTICES.txt"))), "the same bytes as TEC-OS's");
  const text = source.toString("utf8");
  assert.match(text, /Spleen 5x8/);
  const html = readFileSync(resolve(DIST, "index.html"), "utf8");
  assert.ok(html.includes(`<details id="font-notices"><summary>Font notices</summary><pre>${escape(text)}</pre></details>`), "inline and escaped");
  assert.equal(html.split('id="font-notices"').length, 2, "once");
  execFileSync(process.execPath, [resolve(ROOT, "tools/page.mjs")], { stdio: "pipe" });
  const page = readFileSync(resolve(DIST, "tec-os-viewer.html"), "utf8");
  assert.ok(page.includes(`<pre>${escape(text)}</pre>`), "in the standalone page");
});

test("the notice helper escapes markup and refuses each bad input by name", async () => {
  const { serializeNotice, validateNotice } = await import("../tools/notices.mjs");
  const { html, external } = serializeNotice("a&<b>$&c", "directory");
  assert.equal(html, '<details id="font-notices"><summary>Font notices</summary><pre>a&amp;&lt;b&gt;$&amp;c</pre></details>');
  assert.equal(external.toString("utf8"), "a&<b>$&c");
  assert.equal(serializeNotice("x", "standalone").external, null);
  const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
  assert.equal(code(() => serializeNotice("x", "other")), "NOTICE_FORMAT");
  assert.equal(code(() => serializeNotice(7, "directory")), "NOTICE_TEXT");
  assert.equal(code(() => validateNotice(null, "directory")), "NOTICE_MISSING");
  assert.equal(code(() => validateNotice("text", "directory")), "NOTICE_BYTES");
  assert.equal(code(() => validateNotice(new Uint8Array(10), "directory")), "NOTICE_LENGTH");
  assert.equal(code(() => validateNotice(new Uint8Array(2642), "directory")), "NOTICE_HASH");
});
