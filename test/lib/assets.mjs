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

/**
 * The page's recipe with volume LABEL
 * on A: in place of SYSTEM, as CD A:LABEL
 * leaves the card.
 */
export function recipeOn(label, r = recipe()) {
  const out = structuredClone(r);
  if (!out.volumes.some((v) => v.label === label)) throw new Error(`the card has no volume ${label}`);
  for (const v of out.volumes) {
    if (v.label === label) v.mount = "A";
    else if (v.mount === "A") delete v.mount;
  }
  return out;
}
