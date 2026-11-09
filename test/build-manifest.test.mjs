// VS4: tools/page.mjs labels only a clean
// build of the current commits whose dist
// still matches dist/build.json (VE-4).
// Each refusal names its cause. Run npm run
// tecos before this test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./lib/root.mjs";

const DIST = resolve(ROOT, "dist");
const MANIFEST = resolve(DIST, "build.json");
const build = () => execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
const page = () => spawnSync(process.execPath, [resolve(ROOT, "tools/page.mjs")], { encoding: "utf8" });
const refused = (pattern) => {
  const r = page();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, pattern);
};
const edit = (change) => {
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  change(m);
  writeFileSync(MANIFEST, JSON.stringify(m));
};

test("a clean build labels the page, and dist/build.json records it", { timeout: 300_000 }, () => {
  build();
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  assert.equal(m.format, "tecos-viewer-build-v1");
  assert.equal(m.viewer.commit, execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim());
  assert.ok(m.viewer.clean && m.tecos.clean, "built from clean trees");
  assert.ok(m.files["app.js"] && m.files["starter.recipe.json"] && m.files["roms/tecos.rom"]);
  const r = page();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(page().status, 0, "twice");
});

test("each stale or altered dist is refused with its cause (VE-4)", { timeout: 600_000 }, (t) => {
  t.after(() => build());
  build();
  unlinkSync(MANIFEST);
  refused(/dist\/build\.json is missing/);

  build();
  writeFileSync(MANIFEST, "{");
  refused(/cannot be read as JSON/);

  build();
  edit((m) => (m.format = "tecos-viewer-build-v0"));
  refused(/unsupported format/);

  build();
  edit((m) => (m.viewer.commit = "0".repeat(40)));
  refused(/built from the viewer's tree at 0000000, not the current/);

  build();
  edit((m) => (m.tecos.commit = "f".repeat(40)));
  refused(/built from TEC-OS's tree at fffffff, not the current/);

  build();
  writeFileSync(resolve(DIST, "app.js"), readFileSync(resolve(DIST, "app.js"), "utf8") + "\n// changed");
  refused(/dist\/app\.js differs from dist\/build\.json/);

  build();
  writeFileSync(resolve(DIST, "files/EXTRA.COM"), Uint8Array.of(0xc9));
  refused(/dist\/files\/EXTRA\.COM is not in dist\/build\.json/);

  build();
  rmSync(resolve(DIST, "files/DEMO.COM"));
  refused(/dist\/files\/DEMO\.COM is missing/);

  // A build from a changed tree stays uncertified when the change is undone.
  const stray = resolve(ROOT, "vs4-stray.txt");
  writeFileSync(stray, "not committed\n");
  try {
    build();
  } finally {
    unlinkSync(stray);
  }
  refused(/built while the viewer's tree had changes/);
});
