#!/usr/bin/env node
// Embed dist/ in a standalone page:
// dist/tec-os-viewer.html. Run after
// npm run web. Preserve the app code and
// serve embedded assets through fetch.
// Label both repository commits only
// when dist/build.json shows a clean
// build of the current commits and every
// byte in dist still matches it.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputHashes, sourceState } from "./build.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(ROOT, "dist"), out = resolve(dist, "tec-os-viewer.html");
const refuse = (why) => {
  console.error(`No page: ${why}`);
  process.exit(1);
};
const manifestPath = resolve(dist, "build.json");
if (!existsSync(manifestPath)) refuse("dist/build.json is missing; run npm run web");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
  refuse(`dist/build.json cannot be read as JSON: ${error.message}`);
}
if (manifest?.format !== "tecos-viewer-build-v1") refuse("dist/build.json has an unsupported format");
const now = sourceState();
for (const [name, tree] of [["viewer", "the viewer's tree"], ["tecos", "TEC-OS's tree"]]) {
  if (!manifest[name]?.clean) refuse(`dist was built while ${tree} had changes; rebuild from a clean tree`);
  if (!now[name].clean) refuse(`${tree} has changes, so its commit wouldn't name what built the page`);
  if (manifest[name].commit !== now[name].commit) refuse(`dist was built from ${tree} at ${String(manifest[name].commit).slice(0, 7)}, not the current ${now[name].commit.slice(0, 7)}; rebuild`);
}
const want = manifest.files ?? {}, have = outputHashes(dist);
for (const path of Object.keys(want)) if (!(path in have)) refuse(`dist/${path} is missing`);
for (const path of Object.keys(have)) if (!(path in want)) refuse(`dist/${path} is not in dist/build.json`);
for (const [path, sha] of Object.entries(have)) if (want[path] !== sha) refuse(`dist/${path} differs from dist/build.json`);
const viewer = now.viewer.commit.slice(0, 7), tecos = now.tecos.commit.slice(0, 7);
const embed = {};
const add = (rel) => (embed[rel] = readFileSync(join(dist, rel)).toString("base64"));
add("starter.recipe.json");
for (const d of ["roms", "files"]) for (const f of readdirSync(join(dist, d)).sort()) if (!f.endsWith(".map")) add(`${d}/${f}`);
let html = readFileSync(join(dist, "index.html"), "utf8");
const css = readFileSync(join(dist, "style.css"), "utf8");
const app = readFileSync(join(dist, "app.js"), "utf8").replace(/\/\/# sourceMappingURL=.*$/m, "");
const shim = `<script>
(() => {
  const files = ${JSON.stringify(embed)};
  const real = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const key = url.replace(/^\\.\\//, "").split("?")[0];
    if (Object.prototype.hasOwnProperty.call(files, key)) {
      const bin = atob(files[key]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return Promise.resolve(new Response(bytes, { status: 200 }));
    }
    return real(input, init);
  };
})();
</script>`;
html = html.replace(/<link rel="stylesheet" href="style.css" \/>/, `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module" src="app.js"><\/script>/, () => `${shim}\n<script type="module">\n${app}\n</script>`);
html = html.replace("</h1>", ` <span class="sub">built from tec-os-viewer ${viewer} and tec-os ${tecos}</span></h1>`);
if (!html.includes(shim) || html.includes('src="app.js"') || html.includes('href="style.css"')) throw new Error("page not assembled");
writeFileSync(out, html);
console.log(`${out}: ${html.length} bytes, ${Object.keys(embed).length} files embedded`);
