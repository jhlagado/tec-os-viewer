// Build the page assets and card through
// the same tools and helpers as the app.
// Use the pinned TEC-OS Machine and
// its matching fixed test time.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prepareCard } from "../../tec-os/host/card.mjs";
import { Machine } from "../../tec-os/test/lib/machine.mjs";
import { symbolsFromD8 } from "../../tec-os/host/machine.mjs";
import { web, recipe, card, DIST } from "./assets.mjs";

export { Machine, prepareCard };
export const TEST_CLOCK = new Date(2026, 0, 1, 12, 0, 0); // Fixed TEC-OS test time.
export { web, recipe, card, DIST };

/** Load the page ROM and symbol map. */
export function rom() {
  web();
  return { rom: new Uint8Array(readFileSync(resolve(DIST, "roms/tecos.rom"))), symbols: symbolsFromD8({ symbols: JSON.parse(readFileSync(resolve(DIST, "roms/tecos.symbols.json"), "utf8")) }) };
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
