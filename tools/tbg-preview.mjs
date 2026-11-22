// Build a matched TBG preview in a new directory. Run npm run web first.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputHashes } from "./build.mjs";

const [outArg, tecosArg, thoriumArg] = process.argv.slice(2);
if (!outArg || !tecosArg || !thoriumArg) {
  throw new Error("usage: node tools/tbg-preview.mjs NEW_DIR TEC_OS THORIUM");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(outArg);
const tecos = resolve(tecosArg);
const thorium = resolve(thoriumArg);
const firmware = resolve(tecos, "build/tecos");
const d8 = JSON.parse(readFileSync(resolve(firmware, "tecos.d8.json"), "utf8"));
const symbols = d8.symbols
  .filter((s) => typeof (s.address ?? s.value) === "number")
  .map((s) => ({ name: s.name, address: s.address ?? s.value }));
if (!symbols.some((s) => s.name === "LINEPARK")) {
  throw new Error("build the experimental TEC-OS ROM with TECOS_COMSTART=1 first");
}
const manual = readFileSync(resolve(tecos, "documentation/content/tbg/02-watch-the-stack.md"), "utf8");
const example = manual.match(/```asm\n([\s\S]+?)```/)?.[1];
if (!example) throw new Error("the TBG book's STEP.ASM example is missing");
const rom = readFileSync(resolve(firmware, "tecos.rom"));
const svc = readFileSync(resolve(thorium, "build/tbg/TBG.SVC"));
const tas = readFileSync(resolve(thorium, "dist/TAS.COM"));
const ted = readFileSync(resolve(thorium, "dist/TED.COM"));

mkdirSync(out);
for (const file of ["index.html", "style.css", "app.js", "app.js.map", "FONT-NOTICES.txt", "roms", "files"]) {
  cpSync(resolve(root, "dist", file), resolve(out, file), { recursive: true });
}
writeFileSync(resolve(out, "roms/tecos.rom"), rom);
writeFileSync(resolve(out, "roms/tecos.symbols.json"), JSON.stringify(symbols));
const recipe = JSON.parse(readFileSync(resolve(root, "dist/starter.recipe.json"), "utf8"));
recipe.id = "tbg-preview";
recipe.name = "TBG debugger preview";
recipe.instruction = "At A:SYSTEM>, type UNLOAD to release the shell. Type TAS STEP, then TBG.SVC STEP. Click the character LCD to step, inspect the stack, and set a breakpoint. See the TBG book at tec-os.org/tbg/.";
function put(id, name, bytes, description) {
  const url = `files/${name}`;
  writeFileSync(resolve(out, url), bytes);
  recipe.components = recipe.components.filter((c) => c.id !== id);
  recipe.components.push({ id, name, description, files: [{
    name, url, drive: "A", bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }] });
}
put("startup-cmd", "STARTUP.CMD", Buffer.from("\r\n\x1a"), "Start without the optional GLCD service.");
put("tas-com", "TAS.COM", tas, "TAS writes matching .TBG symbols.");
put("ted-com", "TED.COM", ted, "Edit the practice source on the card.");
put("tbg-svc", "TBG.SVC", svc, "LCD debugger with experimental paused-read snapshots.");
put("tbg-step-asm", "STEP.ASM", Buffer.from(example.replaceAll("\n", "\r\n") + "\x1a"), "Six-byte practice program from the TBG book.");
writeFileSync(resolve(out, "starter.recipe.json"), JSON.stringify(recipe, null, 2) + "\n");
writeFileSync(resolve(out, "tbg-preview.json"), JSON.stringify({
  format: "tecos-tbg-preview-v1",
  files: outputHashes(out),
}, null, 2) + "\n");
console.log(`TBG preview: ${out}`);
