#!/usr/bin/env node
// Build the web page into dist/: bundle the script, copy the page, the ROM
// image with its label map, and the page's recipe and files from TEC-OS's
// dist/, once they match pins.json. Run after npm run tecos.

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { check } from "./tecos.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TECOS = resolve(ROOT, "tec-os");
const OUT = resolve(ROOT, "dist");
const PROFILES = ["tecos"]; // one image; the width is a CON PICO 40 or 32 line in the card's STARTUP.CMD

/** Every import of the runtime, the page's and TEC-OS's, resolved from tec-os/ by its exports: one copy, at TEC-OS's version. */
const oneRuntime = {
  name: "one-runtime",
  setup(b) {
    b.onResolve({ filter: /^@jhlagado\/debug80-runtime(\/|$)/ }, (args) =>
      args.pluginData === "one-runtime" ? undefined : b.resolve(args.path, { kind: args.kind, resolveDir: TECOS, pluginData: "one-runtime" }),
    );
  },
};

/** The bundle's options: one runtime, TEC-OS's, and no filesystem in the browser. */
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
  check(); // what is copied is what pins.json names
  rmSync(OUT, { recursive: true, force: true }); // nothing from an older build reaches the page
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
  // The page's card is the starter with DEMO.COM (KD-170), under the name the page fetches.
  copyFileSync(resolve(TECOS, "dist/page.recipe.json"), resolve(OUT, "starter.recipe.json"));
  for (const f of readdirSync(resolve(TECOS, "dist/files"))) {
    copyFileSync(resolve(TECOS, "dist/files", f), resolve(OUT, "files", f));
  }
  console.log(`dist: page, ${PROFILES.length} ROMs, starter files`);
}
