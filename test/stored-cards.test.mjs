import { test } from "node:test";
import { legacyCardUpgrade } from "./lib/stored-cards.mjs";

test("stored cards of older ROMs: PICO.SVC's card is upgraded at 40 columns, and a .DRV card is refused in card.mjs's words", { timeout: 120_000 }, legacyCardUpgrade);
