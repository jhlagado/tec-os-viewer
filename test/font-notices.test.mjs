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
