// Card lifecycle against the actual page
// source:
// a card replaced during a pending save is
// the card stored, and power-on stops the
// old machine before preparing the card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");
const fn = (name) => {
  const at = source.indexOf(name);
  assert.ok(at >= 0, name);
  return source.slice(at, source.indexOf("\n}\n", at) + 3);
};

test("a card opened while the old card is still saving is the card stored", async () => {
  const oldCard = Uint8Array.of(1), newCard = Uint8Array.of(2);
  const stored = [];
  let releaseOld;
  const saveCard = (image) => {
    if (image === oldCard) return new Promise((ok) => (releaseOld = () => { stored.push(image); ok(); }));
    stored.push(image);
    return Promise.resolve();
  };
  const elements = { cardinfo: {} };
  const context = {
    state: { card: oldCard, saving: false, importBusy: false },
    saveCard, $: (id) => elements[id], parseContainer: () => {}, refreshCard: () => {}, powerOn: async () => {},
  };
  runInNewContext(`${fn("async function save(")}\n${fn("async function useCard(")}\nthis.save = save; this.useCard = useCard;`, context);
  const pending = context.save(oldCard);
  const opening = context.useCard(newCard);
  await new Promise((ok) => setTimeout(ok, 10));
  releaseOld();
  await pending;
  await opening;
  assert.equal(stored.at(-1), newCard, "the new card is stored last");
  assert.equal(context.state.card, newCard);
  assert.equal(context.state.unsaved ?? false, false);
});

test("power-on stops the old machine before it prepares the card", async () => {
  const old = { name: "old" };
  const seen = [];
  const context = {
    state: { card: Uint8Array.of(0), display: "tms", width: "40", machine: old },
    prepareCard: () => {
      seen.push(context.state.machine);
      return { problem: null, note: null, changed: true };
    },
    loadRom: async () => ({ rom: new Uint8Array(1), symbols: {} }),
    Machine: class { constructor(options) { this.options = options; } },
    appendSerial: () => {},
  };
  const life = source.slice(source.indexOf("let turn = Promise.resolve();"), source.indexOf("\nfunction reset()"));
  runInNewContext(`${life}\nthis.powerOn = powerOn;`, context);
  await context.powerOn();
  assert.deepEqual(seen, [null], "no machine can write the card while it is prepared");
  assert.notEqual(context.state.machine, old);
  assert.equal(context.state.machine.options.sdImage, context.state.card);
});
