#!/usr/bin/env node
// Bundle the page into dist/ and copy
// its firmware, symbols and card assets.
// Run after npm run tecos. Check the
// ROM and card-file pins before copying.
// Write dist/build.json last: both full
// commits, whether each tree was clean
// when the build started, and the hash
// of every file in dist. tools/page.mjs
// labels only a build that matches it.

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check } from "./tecos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TECOS = resolve(ROOT, "tec-os");
const OUT = resolve(ROOT, "dist");
const { build } = createRequire(resolve(TECOS, "package.json"))("esbuild");
const PROFILES = ["tecos"]; // One image for all widths.
// prepareCard selects 40/32 through
// STARTUP.CMD.

/**
 * Resolve all runtime imports through
 * the submodule's package exports.
 * Keep one copy at its pinned version.
 */
const oneRuntime = {
  name: "one-runtime",
  setup(b) {
    b.onResolve({ filter: /^@jhlagado\/debug80-runtime(\/|$)/ }, (args) =>
      args.pluginData === "one-runtime" ? undefined : b.resolve(args.path, { kind: args.kind, resolveDir: TECOS, pluginData: "one-runtime" }),
    );
  },
};

/** Bundle with the browser fs stub. */
export const bundleOptions = {
  entryPoints: [resolve(ROOT, "src/main.mjs")],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: resolve(OUT, "app.js"),
  alias: { fs: resolve(ROOT, "stub/fs.mjs") },
  plugins: [oneRuntime],
  minify: true,
  sourcemap: true,
  logLevel: "warning",
};

const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();

/** Each repository's full commit and whether its tracked tree is clean. */
export function sourceState() {
  return {
    viewer: { commit: git(ROOT, "rev-parse", "HEAD"), clean: git(ROOT, "status", "--porcelain") === "" },
    tecos: { commit: git(TECOS, "rev-parse", "HEAD"), clean: git(TECOS, "status", "--porcelain") === "" },
  };
}

/** Every file under DIR but the manifest and the page, by path, with its SHA-256. */
export function outputHashes(dir = OUT) {
  const files = {};
  const walk = (rel) => {
    for (const e of readdirSync(resolve(dir, rel), { withFileTypes: true })) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path);
      else if (path !== "build.json" && path !== "tec-os-viewer.html") {
        files[path] = createHash("sha256").update(readFileSync(resolve(dir, path))).digest("hex");
      }
    }
  };
  walk("");
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  check(); // Check ROM and card-file pins.
  const before = sourceState();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(resolve(OUT, "roms"), { recursive: true });
  mkdirSync(resolve(OUT, "files"), { recursive: true });

  await build(bundleOptions);

  for (const f of ["index.html", "style.css"]) copyFileSync(resolve(ROOT, f), resolve(OUT, f));
  for (const p of PROFILES) {
    copyFileSync(resolve(TECOS, `dist/${p}.rom`), resolve(OUT, `roms/${p}.rom`));
    const d8 = JSON.parse(readFileSync(resolve(TECOS, `dist/${p}.d8.json`), "utf8"));
    const labels = d8.symbols
      .filter((s) => typeof (s.address ?? s.value) === "number")
      .map((s) => ({ name: s.name, address: s.address ?? s.value }));
    writeFileSync(resolve(OUT, `roms/${p}.symbols.json`), JSON.stringify(labels));
  }
  // The page recipe adds DEMO.COM to the
  // starter card (KD-170). Copy it under
  // the path fetched by the page.
  copyFileSync(resolve(TECOS, "dist/page.recipe.json"), resolve(OUT, "starter.recipe.json"));
  for (const f of readdirSync(resolve(TECOS, "dist/files"))) {
    copyFileSync(resolve(TECOS, "dist/files", f), resolve(OUT, "files", f));
  }
  // The manifest goes last, so a failed
  // build leaves none. A build from a
  // changed tree records clean=false.
  const after = sourceState();
  const same = before.viewer.commit === after.viewer.commit && before.tecos.commit === after.tecos.commit;
  const manifest = {
    format: "tecos-viewer-build-v1",
    viewer: { commit: after.viewer.commit, clean: same && before.viewer.clean && after.viewer.clean },
    tecos: { commit: after.tecos.commit, clean: same && before.tecos.clean && after.tecos.clean },
    files: outputHashes(),
  };
  writeFileSync(resolve(OUT, "build.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`dist: page, ${PROFILES.length} ROMs, starter files${manifest.viewer.clean && manifest.tecos.clean ? "" : " (from a changed tree)"}`);
}
