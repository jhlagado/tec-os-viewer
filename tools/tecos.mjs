#!/usr/bin/env node
// Check the pinned firmware and the
// starter recipe, the one card that
// the page loads.
// npm run inputs in tec-os checks the
// pinned inputs that tec-os's
// test/inputs.json lists: from
// Thorium, Baza and MON-3's sources.
// Each comes from its variable when
// set, else tec-os/.inputs/, else a
// pinned sibling checkout, else it is
// fetched; see TEC-OS's README.
// A build needs read access to
// jhlagado/tec-os and to the inputs'
// repositories, jhlagado/thorium,
// jhlagado/baza and
// jhlagado/debug80-tec1g-mon3, at the
// commits test/inputs.json pins.
// Without it, supply the files through
// the variables or tec-os/.inputs/.
// TAS builds everything; it runs on the
// host from Thorium's runner, taken
// from TECOS_TAS_HOST when set, else
// tec-os/.inputs/tas-host, which is
// prepared as TEC-OS's README says when
// it is missing.
//
// node tools/tecos.mjs: build and check
// node tools/tecos.mjs --check: check

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TECOS = resolve(ROOT, "tec-os");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * List checkout, file and recipe faults.
 * Return an empty list on a match.
 */
export function problems() {
  const found = [];
  const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trimEnd();
  const pinned = git(ROOT, "rev-parse", "HEAD:tec-os");
  const checked = git(TECOS, "rev-parse", "HEAD");
  if (pinned !== checked) found.push(`tec-os is checked out at ${checked}, not the viewer's pin ${pinned}`);
  const status = git(TECOS, "status", "--porcelain").split("\n").filter(Boolean);
  const untracked = status.filter((l) => l.startsWith("??"));
  const changed = status.filter((l) => !l.startsWith("??"));
  if (changed.length) found.push(`tec-os has changes to tracked files:\n${changed.join("\n")}`);
  if (untracked.length) found.push(`tec-os has untracked files:\n${untracked.join("\n")}`);
  const pins = JSON.parse(readFileSync(resolve(ROOT, "pins.json"), "utf8"));
  const files = resolve(TECOS, "dist/files");
  for (const name of existsSync(files) ? readdirSync(files) : []) {
    if (!Object.hasOwn(pins.files, name)) found.push(`tec-os/dist/files/${name} is not named in pins.json`);
  }
  const rom = resolve(TECOS, "dist/tecos.rom");
  if (!existsSync(rom)) found.push("tec-os/dist/tecos.rom is missing: run npm run tecos");
  else if (sha(rom) !== pins.rom) found.push(`tec-os/dist/tecos.rom has SHA-256 ${sha(rom)}, not the pinned ${pins.rom}`);
  for (const [name, want] of Object.entries(pins.files)) {
    const path = resolve(TECOS, "dist/files", name);
    if (!existsSync(path)) found.push(`tec-os/dist/files/${name} is missing`);
    else if (sha(path) !== want) found.push(`tec-os/dist/files/${name} has SHA-256 ${sha(path)}, not the pinned ${want}`);
  }
  const recipePath = resolve(TECOS, "dist/starter.recipe.json");
  const recipeName = "tec-os/dist/starter.recipe.json";
  if (!existsSync(recipePath)) {
    found.push(`${recipeName} is missing`);
    return found;
  }
  let recipe;
  try {
    recipe = JSON.parse(readFileSync(recipePath, "utf8"));
  } catch (error) {
    found.push(`${recipeName} cannot be read as JSON: ${error.message}`);
    return found;
  }
  if (recipe === null || typeof recipe !== "object" || Array.isArray(recipe)) {
    found.push(`${recipeName} must be an object`);
    return found;
  }
  const fault = (message) => found.push(`${recipeName}: ${message}`);
  if (recipe.schema !== "tecos-file-recipe-v1") fault("unsupported schema");
  if (recipe.profile !== "tecos") fault("profile must be tecos");
  const systemVolumes = Array.isArray(recipe.volumes)
    ? recipe.volumes.filter((volume) => String(volume?.mount ?? "").toUpperCase().replace(/:$/, "") === "A") : [];
  if (systemVolumes.length !== 1 || systemVolumes[0].geometry !== "G1M" || systemVolumes[0].readOnly) {
    fault("starter files need one writable G1M volume mounted at A");
  }
  if (!Array.isArray(recipe.components)) {
    fault("components must be an array");
    return found;
  }
  const declared = new Set();
  for (const component of recipe.components) {
    if (component === null || typeof component !== "object" || !Array.isArray(component.files)) {
      fault("component files must be an array");
      continue;
    }
    for (const file of component.files) {
      if (file === null || typeof file !== "object" || typeof file.name !== "string") {
        fault("file declarations must have a name");
        continue;
      }
      const name = file.name;
      if (!Object.hasOwn(pins.files, name)) {
        fault(`${name} is not named in pins.json`);
        continue;
      }
      if (declared.has(name)) fault(`${name} is declared more than once`);
      declared.add(name);
      if (file.url !== `files/${name}`) fault(`${name} URL must be files/${name}`);
      if ((file.drive ?? "A") !== "A" || (file.user ?? 0) !== 0) {
        fault(`${name} must be placed on drive A in user 0`);
      }
      const path = resolve(files, name);
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path);
      if (file.bytes !== bytes.length) fault(`${name} has ${bytes.length} bytes, recipe says ${file.bytes}`);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (file.sha256 !== pins.files[name] || file.sha256 !== actual) {
        fault(`${name} recipe SHA-256 disagrees with its file or pin`);
      }
    }
  }
  for (const name of Object.keys(pins.files)) {
    if (!declared.has(name)) fault(`${name} is missing from the recipe`);
  }
  // Every other field is pinned too,
  // through the recipe's canonical form,
  // so a change the checks above don't
  // read, such as another volume, can't
  // pass unseen.
  const canonical = recipeDigest(recipe);
  if (canonical !== pins.recipe) fault(`its canonical SHA-256 is ${canonical}, not the pinned ${pins.recipe}`);
  return found;
}

/**
 * The SHA-256 of RECIPE's canonical form:
 * keys sorted, mounts and drives in upper
 * case without a colon, flags as booleans,
 * a file's drive A and user 0 when absent.
 * The spellings of the A mount and of the
 * flags that the card builder treats alike
 * give the same digest.
 */
export function recipeDigest(recipe) {
  const letter = (v) => String(v ?? "A").toUpperCase().replace(/:$/, "");
  const normal = structuredClone(recipe);
  for (const v of Array.isArray(normal.volumes) ? normal.volumes : []) {
    if (v && typeof v === "object") {
      if (v.mount !== undefined && v.mount !== null) v.mount = letter(v.mount);
      v.readOnly = Boolean(v.readOnly);
      v.writeBehind = Boolean(v.writeBehind);
    }
  }
  for (const c of Array.isArray(normal.components) ? normal.components : []) {
    for (const f of Array.isArray(c?.files) ? c.files : []) {
      if (f && typeof f === "object") {
        f.drive = letter(f.drive);
        f.user = f.user ?? 0;
      }
    }
  }
  const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === "object"
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
  return createHash("sha256").update(JSON.stringify(sorted(normal))).digest("hex");
}

/** Report mismatches and exit on error. */
export function check() {
  const found = problems();
  if (found.length) {
    console.error(`TEC-OS doesn't match pins.json:\n- ${found.join("\n- ")}`);
    process.exit(1);
  }
}

/**
 * Prepare tec-os/.inputs/tas-host, the
 * TAS runner TEC-OS's build uses, unless
 * TECOS_TAS_HOST names one or it is
 * there: Thorium at the runner commit
 * TEC-OS pins, with its dependencies.
 * TEC-OS checks the runner's pins.
 */
function tasHost() {
  if (process.env.TECOS_TAS_HOST) return;
  const host = resolve(TECOS, ".inputs/tas-host");
  if (existsSync(host)) return;
  const pin = /const runnerPin = '([0-9a-f]{40})'/.exec(readFileSync(resolve(TECOS, "tools/lib/tas-rom.mjs"), "utf8"))?.[1];
  if (!pin) throw new Error("tec-os/tools/lib/tas-rom.mjs names no TAS runner commit");
  mkdirSync(resolve(TECOS, ".inputs"), { recursive: true });
  const stage = mkdtempSync(resolve(TECOS, ".inputs/.tas-host."));
  const run = (cmd, ...args) => execFileSync(cmd, args, { cwd: stage, stdio: "inherit" });
  run("git", "clone", "-q", "https://github.com/jhlagado/thorium.git", ".");
  run("git", "checkout", "-q", "--detach", pin);
  run("npm", "ci");
  renameSync(stage, host);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--check")) {
    const npm = (...args) => execFileSync("npm", args, { cwd: TECOS, stdio: "inherit" });
    npm("ci");
    npm("run", "inputs");
    tasHost();
    npm("run", "build");
    npm("run", "media");
  }
  check();
  console.log("tec-os: ROM, card files and recipe checks pass");
}
