// Browser-only asset preparation avoids
// loading the Node emulator in tests
// that execute the guest in Chromium.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRecipe } from "../../tec-os/tools/lib/recipe.mjs";
import { ROOT } from "./root.mjs";

export const DIST = resolve(ROOT, "dist");

let built = false;
/** Build dist/ once per test process. */
export function web() {
  if (!built) execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  built = true;
}

/** Load the page card recipe. */
export function recipe() {
  web();
  return JSON.parse(readFileSync(resolve(DIST, "starter.recipe.json"), "utf8"));
}

/**
 * Build a card from the recipe using
 * the page's distribution-file paths.
 */
export async function card(r = recipe()) {
  return buildRecipe(r, async (url) => new Uint8Array(readFileSync(resolve(DIST, url))));
}

