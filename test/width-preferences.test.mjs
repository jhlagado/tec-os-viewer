// Check the page's actual startup and
// width handler without a browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { prepareCard } from "../tec-os/host/card.mjs";
import { createContainer, parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";

const source = readFileSync(new URL("../src/main.mjs", import.meta.url), "utf8");

function startup(code = source, saved = null, { readFails = false, writeFails = false } = {}) {
  const reads = [], writes = [];
  const stored = new Map(saved === null ? [] : [["tecos.width", saved]]);
  const context = {
    localStorage: {
      getItem(key) {
        reads.push(key);
        if (readFails) throw new Error("storage unavailable");
        return stored.get(key) ?? null;
      },
      setItem(key, value) {
        writes.push([key, value]);
        if (writeFails) throw new Error("storage full");
        stored.set(key, value);
      },
    },
  };
  const marker = code.indexOf("const $ =");
  const start = code.indexOf("\n", marker) + 1;
  const end = code.indexOf("async function fetchBytes(", start);
  assert.ok(marker >= 0 && start > marker && end > start, "page initialization boundaries");
  runInNewContext(`${code.slice(start, end)}\nthis.state = state;`, context);
  assert.equal(reads.filter((key) => key === "tecos.width").length, 1, "read the stored width once");
  return { context, state: context.state, writes, stored };
}

const expectWidth = (page, width) => assert.equal(page.state.width, width);

test("missing or invalid saved widths start at 40", () => {
  for (const saved of [null, "", "20", "80 ", "garbage"]) expectWidth(startup(source, saved), "40");
});

test("saved 32, 40 and 80-column choices are retained", () => {
  for (const saved of ["32", "40", "80"]) expectWidth(startup(source, saved), saved);
});

test("unavailable preference storage starts at 40", () => {
  expectWidth(startup(source, null, { readFails: true }), "40");
});

test("the initial HTML selects 40 and retains all three width choices", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const profile = html.match(/<select id="profile">([\s\S]*?)<\/select>/);
  assert.ok(profile, "the width selector exists");
  const options = [...profile[1].matchAll(/<option value="(\d+)"([^>]*)>/g)];
  assert.deepEqual(options.map((match) => match[1]).sort(), ["32", "40", "80"]);
  assert.deepEqual(options.filter((match) => /\bselected\b/.test(match[2])).map((match) => match[1]), ["40"]);
});

test("the real width handler persists each choice and prepares the card even when storage writes fail", async () => {
  for (const writeFails of [false, true]) {
    const page = startup(source, null, { writeFails });
    const image = createContainer([{ geometry: "G1M", label: "SYSTEM", mount: "A" }]);
    const v = parseContainer(image).volumes[0];
    const a = new CpmVolume(volumePayload(image, v), v.g);
    a.write("STARTUP.CMD", Buffer.from("USER 0\r\n\x1a", "latin1"));
    page.state.card = image;
    const messages = [];
    let handler, powers = 0;
    const profile = { addEventListener: (type, fn) => { assert.equal(type, "change"); handler = fn; } };
    Object.assign(page.context, {
      $: (id) => { assert.equal(id, "profile"); return profile; },
      prepareCard,
      loadRom: async () => ({ rom: new Uint8Array(0), symbols: new Map() }),
      Machine: class { constructor(options) { assert.equal(options.sdImage, image); powers++; } },
      appendSerial: (text) => messages.push(text),
    });
    const lifeStart = source.indexOf("let turn = Promise.resolve();");
    const lifeEnd = source.indexOf("\nfunction reset()", lifeStart);
    const controlStart = source.indexOf('$("profile").value =');
    const controlEnd = source.indexOf('$("reset").addEventListener', controlStart);
    assert.ok(lifeStart >= 0 && lifeEnd > lifeStart && controlStart >= 0 && controlEnd > controlStart);
    runInNewContext(`${source.slice(lifeStart, lifeEnd)}\n${source.slice(controlStart, controlEnd)}\nthis.powerOn = powerOn;`, page.context);
    assert.equal(profile.value, "40");
    await page.context.powerOn();
    assert.equal(Buffer.from(a.read("STARTUP.CMD", { text: true })).toString("latin1"), "CON PICO 40\nUSER 0\n");
    for (const width of ["32", "80", "40"]) {
      await handler({ target: { value: width } });
      expectWidth(page, width);
      const expected = width === "80" ? "USER 0\n" : `CON PICO ${width}\nUSER 0\n`;
      assert.equal(Buffer.from(a.read("STARTUP.CMD", { text: true })).toString("latin1"), expected);
      assert.equal(page.stored.get("tecos.width"), writeFails ? undefined : width);
    }
    assert.deepEqual(page.writes, [["tecos.width", "32"], ["tecos.width", "80"], ["tecos.width", "40"]]);
    assert.equal(powers, 4);
    assert.deepEqual(messages, Array(4).fill("\n[power on]\n"));
  }
});

test("an 80-column fallback fails the same fresh-session assertion", () => {
  const oldDefault = source.replace('includes(savedWidth) ? savedWidth : "40"', 'includes(savedWidth) ? savedWidth : "80"');
  assert.notEqual(oldDefault, source, "the fallback control changes actual page initialization");
  const page = startup(oldDefault);
  expectWidth(page, "80");
  assert.throws(() => expectWidth(page, "40"), { name: "AssertionError", code: "ERR_ASSERTION", actual: "80", expected: "40" });
});
