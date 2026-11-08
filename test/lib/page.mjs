// Build the page assets and card through
// the same tools and helpers as the app.
// Use the pinned TEC-OS Machine and
// its matching fixed test time.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRecipe } from "../../tec-os/tools/lib/recipe.mjs";
import { prepareCard } from "../../tec-os/host/card.mjs";
import { Machine } from "../../tec-os/test/lib/machine.mjs";
import { symbolsFromD8 } from "../../tec-os/host/machine.mjs";
import { ROOT } from "./root.mjs";

export { Machine, prepareCard };
export const TEST_CLOCK = new Date(2026, 0, 1, 12, 0, 0); // Fixed TEC-OS test time.
export const DIST = resolve(ROOT, "dist");

let built = false;
/** Build dist/ once per test process. */
export function web() {
  if (!built) execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  built = true;
}

/** Load the page ROM and symbol map. */
export function rom() {
  web();
  return { rom: new Uint8Array(readFileSync(resolve(DIST, "roms/tecos.rom"))), symbols: symbolsFromD8({ symbols: JSON.parse(readFileSync(resolve(DIST, "roms/tecos.symbols.json"), "utf8")) }) };
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

/** Board devices and page display. */
export const BOARDS = {
  serial: { tms: false, matrix: false, glcd: false, display: "tms" },
  pico: { tms: true, matrix: true, glcd: false, display: "tms" },
  glcd: { tms: false, matrix: true, glcd: true, display: "glcd" },
  both: { tms: true, matrix: true, glcd: true, display: "tms" },
};

/**
 * Prepare the card for the board/width,
 * then create its machine. Reject card
 * problems before machine construction.
 */
export function power(image, board, width = 80) {
  const b = BOARDS[board];
  const { problem } = prepareCard(image, b.display, width);
  if (problem) throw new Error(`${board}: ${problem}`);
  return new Machine({ ...rom(), sdImage: image, tms: b.tms, matrix: b.matrix, glcd: b.glcd, clock: TEST_CLOCK });
}
