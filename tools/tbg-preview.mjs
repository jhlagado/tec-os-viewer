// Build a matched TBG preview in a new directory. Run npm run web first.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputHashes } from "./build.mjs";

const [outArg, tecosArg, thoriumArg, tbgArg, bookArg] = process.argv.slice(2);
if (!outArg || !tecosArg || !thoriumArg) {
  throw new Error("usage: node tools/tbg-preview.mjs NEW_DIR TEC_OS THORIUM [TBG] [BOOK]");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(outArg);
const tecos = resolve(tecosArg);
const thorium = resolve(thoriumArg);
// TBG builds in its own repository, by default beside Thorium.
const tbg = resolve(tbgArg ?? resolve(thorium, "../tbg"));
// The book's examples come from a TEC-OS checkout of main, by default TEC_OS.
const book = resolve(bookArg ?? tecos);
const firmware = resolve(tecos, "build/tecos");
const d8 = JSON.parse(readFileSync(resolve(firmware, "tecos.d8.json"), "utf8"));
const symbols = d8.symbols
  .filter((s) => typeof (s.address ?? s.value) === "number")
  .map((s) => ({ name: s.name, address: s.address ?? s.value }));
if (!symbols.some((s) => s.name === "COMVEC")) { // TEC-OS ABI 5.3: TBG.SVC ARM.
  throw new Error("build a TEC-OS ROM with ABI 5.3 or later, which has COMVEC, first");
}
const manual = readFileSync(resolve(book, "documentation/content/tbg/02-watch-the-stack.md"), "utf8");
const example = manual.match(/```asm\n([\s\S]+?)```/)?.[1];
if (!example) throw new Error("the TBG book's STEP.ASM example is missing");
const fillPage = readFileSync(resolve(book, "documentation/content/tbg/04-follow-data.md"), "utf8");
const fill = fillPage.match(/```asm\n([\s\S]+?)```/)?.[1];
if (!fill) throw new Error("the TBG book's FILL.ASM example is missing");
const rom = readFileSync(resolve(firmware, "tecos.rom"));
const svc = readFileSync(resolve(tbg, "build/TBG.SVC"));
const help = readFileSync(resolve(tbg, "build/TBG.HLP"));
const tbgsym = readFileSync(resolve(tbg, "build/TBGSYM.SVC"));
const tas = readFileSync(resolve(thorium, "dist/TAS.COM"));
const ted = readFileSync(resolve(thorium, "dist/TED.COM"));

mkdirSync(out);
for (const file of ["index.html", "style.css", "app.js", "app.js.map", "FONT-NOTICES.txt", "roms", "files"]) {
  cpSync(resolve(root, "dist", file), resolve(out, file), { recursive: true });
}
const htmlPath = resolve(out, "index.html");
const html = readFileSync(htmlPath, "utf8");
writeFileSync(htmlPath, html.replace('<html lang="en">', '<html lang="en" data-card-namespace="tecos-tbg-preview">'));
writeFileSync(resolve(out, "roms/tecos.rom"), rom);
writeFileSync(resolve(out, "roms/tecos.symbols.json"), JSON.stringify(symbols));
const recipe = JSON.parse(readFileSync(resolve(root, "dist/starter.recipe.json"), "utf8"));
recipe.id = "tbg-preview";
recipe.name = "TBG debugger preview";
recipe.instruction = "At A:SYSTEM>, type UNLOAD to release the shell. Type TAS STEP, then TBG.SVC STEP. For labels, type TBGSYM.SVC once after TBG.SVC. Click the character LCD to step, inspect the stack, and set a breakpoint. See the TBG book at tec-os.org/tbg/.";
// The preview's files go on the SYSTEM volume, replacing the card's own copy.
function put(name, bytes, description) {
  const url = `files/${name}`;
  const id = `system-${name}`.toLowerCase().replace(/\W/g, "-");
  writeFileSync(resolve(out, url), bytes);
  recipe.components = recipe.components.filter((c) => c.id !== id);
  recipe.components.push({ id, name, description, files: [{
    name, url, drive: "SYSTEM", bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }] });
}
put("STARTUP.CMD", Buffer.from("\r\n\x1a"), "Start without the optional GLCD service.");
put("TAS.COM", tas, "TAS writes matching .TBG symbols.");
put("TED.COM", ted, "Edit the practice source on the card.");
put("TBG.SVC", svc, "The TBG LCD debugger.");
put("TBGSYM.SVC", tbgsym, "Labels for TBG from the .TBG file TAS writes; install after TBG.SVC.");
put("TBG.HLP", help, "The help pages H shows in TBG.");
put("STEP.ASM", Buffer.from(example.replaceAll("\n", "\r\n") + "\x1a"), "Six-byte practice program from the TBG book.");
put("FILL.ASM", Buffer.from(fill.replaceAll("\n", "\r\n") + "\x1a"), "The TBG book's data-following example.");
writeFileSync(resolve(out, "starter.recipe.json"), JSON.stringify(recipe, null, 2) + "\n");
writeFileSync(resolve(out, "tbg-preview.json"), JSON.stringify({
  format: "tecos-tbg-preview-v1",
  files: outputHashes(out),
}, null, 2) + "\n");
console.log(`TBG preview: ${out}`);
