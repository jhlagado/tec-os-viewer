// The page's card and ROM, as the page makes them: dist/ from tools/build.mjs,
// the card by buildRecipe from the page's recipe and prepareCard for the board,
// and TEC-OS's Machine and test clock from tec-os/.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRecipe } from "../../tec-os/tools/lib/recipe.mjs";
import { prepareCard } from "../../tec-os/host/card.mjs";
import { Machine } from "../../tec-os/test/lib/machine.mjs";
import { symbolsFromD8 } from "../../tec-os/host/machine.mjs";
import { ROOT } from "./root.mjs";

export { Machine, prepareCard };
export const TEST_CLOCK = new Date(2026, 0, 1, 12, 0, 0); // TEC-OS's test clock, so a run reads the same time on any host
export const DIST = resolve(ROOT, "dist");

let built = false;
/** dist/, built once a run by npm run web's script. */
export function web() {
  if (!built) execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  built = true;
}

/** The page's ROM and its labels, from dist/roms/, read as the page reads them. */
export function rom() {
  web();
  return { rom: new Uint8Array(readFileSync(resolve(DIST, "roms/tecos.rom"))), symbols: symbolsFromD8({ symbols: JSON.parse(readFileSync(resolve(DIST, "roms/tecos.symbols.json"), "utf8")) }) };
}

/** The page's recipe, or RECIPE changed from it. */
export function recipe() {
  web();
  return JSON.parse(readFileSync(resolve(DIST, "starter.recipe.json"), "utf8"));
}

/** A card from RECIPE, its files read from dist/ by the paths the page fetches. */
export async function card(r = recipe()) {
  return buildRecipe(r, async (url) => new Uint8Array(readFileSync(resolve(DIST, url))));
}

/** The boards: what each fits, and the display the page is set to for it. */
export const BOARDS = {
  serial: { tms: false, matrix: false, glcd: false, display: "tms" },
  pico: { tms: true, matrix: true, glcd: false, display: "tms" },
  glcd: { tms: false, matrix: true, glcd: true, display: "glcd" },
  both: { tms: true, matrix: true, glcd: true, display: "tms" },
};

/** IMAGE readied by prepareCard for BOARD at WIDTH, as the page's power on does, then a machine on it. */
export function power(image, board, width = 80) {
  const b = BOARDS[board];
  const { problem } = prepareCard(image, b.display, width);
  if (problem) throw new Error(`${board}: ${problem}`);
  return new Machine({ ...rom(), sdImage: image, tms: b.tms, matrix: b.matrix, glcd: b.glcd, clock: TEST_CLOCK });
}
