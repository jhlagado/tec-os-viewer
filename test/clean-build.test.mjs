// Check that the web build removes old
// distribution files. Run npm run tecos
// before this test.

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOT } from "./lib/root.mjs";

test("the web build starts clean: a file left in dist from an older build doesn't reach the page", { timeout: 300_000 }, () => {
  mkdirSync(resolve(ROOT, "dist/files"), { recursive: true });
  writeFileSync(resolve(ROOT, "dist/files/EDIT.COM"), Uint8Array.from([0xc9]));
  execFileSync(process.execPath, ["tools/build.mjs"], { cwd: ROOT, stdio: "ignore" });
  assert.deepEqual(readdirSync(resolve(ROOT, "dist/files")).sort(), readdirSync(resolve(ROOT, "tec-os/dist/files")).sort());
});
