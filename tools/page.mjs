#!/usr/bin/env node
// One self-contained viewer page from dist/, for a private link:
// dist/tec-os-viewer.html, labelled with the viewer's commit and TEC-OS's. The
// page's files are embedded and served to its fetch calls by their relative
// paths; the page's code is unchanged. Run after npm run web.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(ROOT, "dist"), out = resolve(dist, "tec-os-viewer.html");
const commit = (dir) => execFileSync("git", ["-C", dir, "rev-parse", "--short=7", "HEAD"], { encoding: "utf8" }).trim();
const viewer = commit(ROOT), tecos = commit(resolve(ROOT, "tec-os"));
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
