import { test } from "node:test";
import { fullDirectoryRecovery } from "./lib/stored-cards.mjs";

test("a card stored before the shell whose A: directory is full boots without the shell, the page says the shell couldn't be added, and a power cycle tries again without fetching the starter card again", { timeout: 180_000 }, fullDirectoryRecovery);
