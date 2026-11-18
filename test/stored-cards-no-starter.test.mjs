import { test } from "node:test";
import { missingStarterRecovery } from "./lib/stored-cards.mjs";

test("a card stored before the shell boots without it when the starter card can't be fetched, and the page says the next power-on tries again", { timeout: 180_000 }, missingStarterRecovery);
