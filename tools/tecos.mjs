#!/usr/bin/env node
// The TEC-OS step: build TEC-OS's ROM and media in the submodule at its pin,
// then check what they made against pins.json. TAS_COM and TED_COM, when both
// are set, name the Thorium inputs; otherwise npm run inputs fetches them.
//
//   node tools/tecos.mjs           the whole step, then the check
//   node tools/tecos.mjs --check   the check alone

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TECOS = resolve(ROOT, "tec-os");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Each way TEC-OS's output differs from its pins, in words; none when it matches. */
export function problems() {
  const found = [];
  const dirty = execFileSync("git", ["-C", TECOS, "status", "--porcelain"], { encoding: "utf8" }).trimEnd();
  if (dirty) found.push(`tec-os has changes to tracked files:\n${dirty}`);
  const pins = JSON.parse(readFileSync(resolve(ROOT, "pins.json"), "utf8"));
  const rom = resolve(TECOS, "dist/tecos.rom");
  if (!existsSync(rom)) found.push("tec-os/dist/tecos.rom is missing: run npm run tecos");
  else if (sha(rom) !== pins.rom) found.push(`tec-os/dist/tecos.rom has SHA-256 ${sha(rom)}, not the pinned ${pins.rom}`);
  for (const [name, want] of Object.entries(pins.files)) {
    const path = resolve(TECOS, "dist/files", name);
    if (!existsSync(path)) found.push(`tec-os/dist/files/${name} is missing`);
    else if (sha(path) !== want) found.push(`tec-os/dist/files/${name} has SHA-256 ${sha(path)}, not the pinned ${want}`);
  }
  return found;
}

/** Stop, naming each cause, unless TEC-OS's output matches its pins. */
export function check() {
  const found = problems();
  if (found.length) {
    console.error(`TEC-OS doesn't match pins.json:\n- ${found.join("\n- ")}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--check")) {
    const npm = (...args) => execFileSync("npm", args, { cwd: TECOS, stdio: "inherit" });
    npm("ci");
    if (!(process.env.TAS_COM && process.env.TED_COM)) npm("run", "inputs");
    npm("run", "build");
    npm("run", "media");
  }
  check();
  console.log("tec-os: ROM and the page card's files match pins.json");
}
