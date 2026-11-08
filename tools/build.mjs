#!/usr/bin/env node
// Bundle the page into dist/ and copy
// its firmware, symbols and card assets.
// Run after npm run tecos. Check the
// ROM and card-file pins before copying.

import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  check(); // Check ROM and card-file pins.
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
  console.log(`dist: page, ${PROFILES.length} ROMs, starter files`);
}
