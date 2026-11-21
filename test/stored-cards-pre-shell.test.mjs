import { test } from "node:test";
import { preShellUpgrade } from "./lib/stored-cards.mjs";

test("a card stored before the shell is given the starter's SHELL.SVC and MON3.SVC, keeps the user's files, says so, and boots with the shell", { timeout: 180_000 }, preShellUpgrade);
