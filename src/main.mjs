// Run Tecos in a browser using the
// shared Debug80 TEC-1G machine model.
// Draw its displays and serial output.
// Keep the SD card image in IndexedDB.

import { getMatrixCombosForAscii } from "@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap";
import { Machine, symbolsFromD8 } from "../tec-os/host/machine.mjs";
import { serializeTec1gUpdateFromRuntimeState } from "@jhlagado/debug80-runtime/platforms/tec1g/update-controller";
import { needsStarter, prepareCard } from "../tec-os/host/card.mjs";
import { parseContainer, volumePayload } from "../tec-os/tools/lib/container.mjs";
import { CpmVolume } from "../tec-os/tools/lib/cpmfs.mjs";
import { buildRecipe } from "../tec-os/tools/lib/recipe.mjs";
import { keyInput, keyText, pumpKeys, queueInput, resetKeys } from "./keys.mjs";
import { loadCard, saveCard } from "./store.mjs";
import { Persistence } from "./persistence.mjs";
import { bindGuestProfile, GuestCacheObserver } from "./guest-cache.mjs";
import { chooseText, fromCard } from "./text.mjs";
import { isText80, renderText80, renderTms } from "./tms.mjs";
import { createLcdRenderer } from "./lcd.mjs";

const CPU_HZ = 4_000_000;
const $ = (id) => document.getElementById(id);

const savedWidth = localStorageGet("tecos.width");
const savedDisplay = localStorageGet("tecos.display");
const state = {
  width: ["32", "40", "80"].includes(savedWidth) ? savedWidth : "40",
  display: ["tms", "glcd"].includes(savedDisplay) ? savedDisplay : "tms",
  machine: null,
  observer: null,
  upgradeStarter: null, // The starter card an old card's upgrade copies from.
  drives: null, // Each drive's volume in the running machine, from DRVIDX.
  card: null,
  lifecyclePending: 0,
  machineGeneration: 0,
  running: true,
  serialSeen: 0,
  serialText: "",
  escape: 0,
};

/** Set element ID's text to TEXT, leaving it alone when it already reads so. */
function setText(id, text) {
  const element = $(id);
  if (element.textContent !== text) element.textContent = text;
}

function localStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the session choice on failure.
  }
}

async function fetchBytes(url) {
  const response = await fetch(url, { cache: "no-cache" }); // Revalidate cached files.
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadRom() {
  const [rom, symbols] = await Promise.all([
    fetchBytes("roms/tecos.rom"),
    fetch("roms/tecos.symbols.json", { cache: "no-cache" }).then((r) => r.json()),
  ]);
  const map = symbolsFromD8({ symbols });
  return { rom, symbols: map, cacheBinding: await bindGuestProfile(rom, map) };
}

async function starterCard() {
  const recipe = await fetch("starter.recipe.json", { cache: "no-cache" }).then((r) => r.json());
  return buildRecipe(recipe, fetchBytes);
}

// ---- Machine lifecycle

const persistence = new Persistence({
  write: image => saveCard(image, { owned: true }),
  changed: () => refreshPersistence(),
});
let turn = Promise.resolve();

// Enqueue the entire request before it can read a file or fetch a starter.
// Execution suppression is separate from the user's Pause/Run choice.
function lifecycle(fn) {
  state.observer?.invalidate();
  state.lifecyclePending++;
  refreshCopyAvailability();
  persistence.beginLifecycle();
  const run = turn.then(fn);
  turn = run.catch(() => {});
  return run.finally(() => {
    state.lifecyclePending--;
    persistence.endLifecycle();
    refreshCopyAvailability();
  });
}

function choices() { return { width: $("profile").value, display: $("display").value }; }

function powerOn(options = choices()) {
  return lifecycle(() => powerOnNow(options));
}

async function powerOnNow(options, replacement = null) {
  const previous = state.machine;
  const previousObserver = state.observer;
  const staged = replacement ?? state.card.slice();
  let committed = false;
  let starter = null;
  let unfetched = null;
  if (needsStarter(staged)) {
    try {
      state.upgradeStarter ??= await starterCard();
      starter = state.upgradeStarter;
    } catch (err) {
      console.error("starter card for the upgrade", err);
      unfetched = "This card is from before the shell, and the page couldn't fetch the starter card to add the shell to it, so it boots without the shell. The next power-on tries again.";
    }
  }
  const loaded = await loadRom();
  // Fence old frame continuations before preparation or active publication.
  state.machine = null;
  state.machineGeneration++;
  try {
    const prepared = prepareCard(staged, options.display, options.width, starter);
    if (replacement) {
      await persistence.commit(staged, {
        replace: true,
        publish: image => { state.card = image; },
      });
      committed = true;
    } else if (prepared.changed) {
      // Preparation is usable in memory even when browser storage fails.
      // Publish inside the writer barrier, and mark pending before mutation.
      await persistence.exclusive(() => {
        persistence.dirty();
        state.card.set(staged);
      });
      committed = true;
    }
    const image = state.card;
    const epoch = persistence.epoch;
    let machine;
    const memoryProfile = { ram96: false, windowRam: true, mains: 2, expands: 2 };
    machine = new Machine({
      ...loaded,
      ...memoryProfile,
      sdImage: image,
      tms: options.display === "tms",
      matrix: true,
      onSdWrite: () => {
        if (state.machine === machine && state.card === image && persistence.epoch === epoch) persistence.dirty(image, epoch);
      },
    });
    state.machine = machine;
    state.observer = new GuestCacheObserver(machine, loaded.cacheBinding, memoryProfile, image);
    state.width = options.width;
    state.display = options.display;
    state.drives = null;
    state.serialSeen = 0;
    appendSerial("\n[power on]\n");
    const note = prepared.note ?? (prepared.problem ? null : unfetched);
    for (const words of [prepared.problem, note]) if (words) appendSerial(`[${words}]\n`);
    refreshCard();
    render(machine);
  } catch (error) {
    if (!committed) {
      state.machine = previous;
      state.observer = previousObserver;
    } else {
      state.machine = null;
      state.observer = null;
      error.published = true;
    }
    throw error;
  }
}

function reset() {
  state.observer?.reset();
  state.machineGeneration++;
  if (state.machine) resetKeys(state.machine);
  try { state.machine?.reset(); }
  catch (error) { state.machine = null; throw error; }
  appendSerial("\n[reset]\n");
  if (state.machine) render(state.machine);
}

setInterval(() => persistence.autosave(), 2000);

function refreshPersistence() {
  const status = persistence.status();
  let text;
  if (status.protectedRecord) {
    text = "Browser saving disabled: the stored card could not be read. This session is in memory only; Download image keeps the card bytes. Reload to retry.";
  } else if (status.failure) {
    text = `Card not saved in this browser${status.failures >= 3 ? ": saving keeps failing" : ""}: ${status.failure}. ${status.saving ? "Retrying…" : "Changes remain in memory; Download image keeps a copy."}`;
  } else if (status.saved) text = "Saved card image in this browser";
  else if (status.saving) text = "Saving card image… Changes pending";
  else text = "Changes pending";
  setText("browserstatus", text);
}

function fileProblem(text = "", operation = null) {
  state.fileProblemOperation = operation;
  $("cardproblem").textContent = text;
}
function clearFileProblem(operation) {
  if (state.fileProblemOperation === operation) fileProblem();
}

// ---- Run loop

let last = performance.now();
let cyclesWindow = 0;
let windowStart = last;

function frame(now) {
  const m = state.machine;
  const dt = Math.min(100, now - last);
  last = now;
  if (m && state.running && !state.lifecyclePending) {
    const target = m.cycles + (dt * CPU_HZ) / 1000;
    const deadline = performance.now() + 30;
    const start = m.cycles;
    let n = 0;
    const generation = state.machineGeneration;
    while (m.cycles < target && state.machine === m && state.machineGeneration === generation && !state.lifecyclePending) {
      const observed = state.observer?.machine === m && state.observer.image === state.card ? state.observer : null;
      const pre = observed?.beforeStep();
      m.step();
      if (state.machine === m && state.machineGeneration === generation && observed?.machine === m && observed.image === state.card) observed.afterStep(pre);
      else observed?.invalidate();
      pumpKeys(m);
      if ((++n & 1023) === 0 && performance.now() > deadline) break;
    }
    cyclesWindow += m.cycles - start;
    if (state.machine === m && state.machineGeneration === generation) {
      render(m, now);
      const live = liveDrives(m);
      if (live && live.join() !== state.drives?.join()) {
        state.drives = live;
        refreshCard();
      }
    }
  }
  lcdRenderer.tick(now);
  if (now - windowStart > 1000) {
    $("speed").textContent = state.running ? `${(cyclesWindow / ((now - windowStart) * 1000)).toFixed(2)} MHz` : "paused";
    cyclesWindow = 0;
    windowStart = now;
  }
  refreshGuestStatus();
  refreshCopyAvailability();
  requestAnimationFrame(frame);
}

function refreshGuestStatus() {
  const matched = state.machine && state.observer?.machine === state.machine && state.observer.image === state.card;
  const status = matched ? state.observer.status() : null;
  let text = "Guest cache: state unavailable";
  if (status?.supported && state.machine && !state.lifecyclePending && status.sample) {
    text = `Guest cache: ${status.current ? "" : "last check: "}${status.sample.count} pending blocks`;
  } else if (status && !status.supported) text = "Guest cache: unavailable for this firmware or memory profile";
  if (status?.error) text += ". Guest write error observed; application files may be incomplete";
  else if (status?.resolvedPending) text += ". Earlier pending-write report resolved";
  setText("gueststatus", text);
}

// ---- Rendering

const tmsCanvas = $("tms");
const tmsCtx = tmsCanvas.getContext("2d");
/** An off-screen W by H canvas, its context and an image to draw into it. */
function offscreen(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return [canvas, ctx, ctx.createImageData(w, h)];
}
const [tmsBitmap, tmsBitmapCtx, tmsImage] = offscreen(256, 192);
const [wideBitmap, wideBitmapCtx, wideImage] = offscreen(512, 192);

const lcdRenderer = createLcdRenderer($("lcd"));
const glcdCanvas = $("glcd");
const glcdCtx = glcdCanvas.getContext("2d");
const [glcdBitmap, glcdBitmapCtx, glcdImage] = offscreen(128, 64);

function render(m, now = performance.now()) {
  const p = serializeTec1gUpdateFromRuntimeState(m.tec1g.state);
  drawTms(p.tms9918, m.tec1g.state.display.tms9918);
  drawDigits(p.digits);
  drawLeds(p);
  lcdRenderer.update(p, now);
  drawGlcd(p.glcd, p.glcdState);
  $("latch").textContent =
    `latch ${hex2(m.sysCtrl)}  window ${m.physicalBank < 0 ? "classic" : `bank ${m.physicalBank}`}` +
    `  caps ${p.capsLock ? "on" : "off"}`;
  pullSerial(m);
}

function hex2(v) {
  return v.toString(16).toUpperCase().padStart(2, "0") + "h";
}

function drawTms(tms, device) {
  if (!tms?.active) {
    tmsCtx.fillStyle = "#000";
    tmsCtx.fillRect(0, 0, tmsCanvas.width, tmsCanvas.height);
    return;
  }
  const snapshot = device.stateSnapshot();
  const r = snapshot.registers;
  tmsCtx.imageSmoothingEnabled = false;
  if (isText80(r)) {
    renderText80(wideImage, snapshot);
    wideBitmapCtx.putImageData(wideImage, 0, 0);
    tmsCtx.drawImage(wideBitmap, 0, 0, tmsCanvas.width, tmsCanvas.height);
    return;
  }
  const ownMode = (r[1] & 0x10) !== 0 || ((r[1] & 0x18) === 0 && (r[0] & 0x02) === 0);
  renderTms(tmsImage, snapshot, ownMode ? null : tms.framebuffer);
  tmsBitmapCtx.putImageData(tmsImage, 0, 0);
  tmsCtx.drawImage(tmsBitmap, 0, 0, tmsCanvas.width, tmsCanvas.height);
}

// Port 02h segment bits: 0 a, 1 f, 2 g,
// 3 b, 4 dp, 5 c, 6 e and 7 d.
const SEGMENTS = [
  ["a", 0, "M8 4h20l-3 4H11z"],
  ["f", 1, "M6 6l4 4v14l-4 3z"],
  ["g", 2, "M9 28h18l2 2-2 2H9l-2-2z"],
  ["b", 3, "M30 6v21l-4-3V10z"],
  ["dp", 4, "M32 50a2.5 2.5 0 1 0 0.1 0z"],
  ["c", 5, "M30 33v21l-4-4V36z"],
  ["e", 6, "M6 33l4 3v14l-4 4z"],
  ["d", 7, "M11 52h14l3 4H8z"],
];
const digitEls = [];
for (let i = 0; i < 6; i += 1) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 36 60");
  for (const [, bit, d] of SEGMENTS) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "seg");
    path.dataset.bit = String(bit);
    svg.appendChild(path);
  }
  $("digits").appendChild(svg);
  digitEls.push([...svg.querySelectorAll("path")]);
}
function drawDigits(digits) {
  for (let i = 0; i < 6; i += 1) {
    const value = digits?.[5 - i] ?? 0; // Index 5 is leftmost.
    for (const path of digitEls[i]) path.classList.toggle("on", (value & (1 << Number(path.dataset.bit))) !== 0);
  }
}

const ledEls = [];
for (let i = 0; i < 64; i += 1) {
  const dot = document.createElement("div");
  $("leds").appendChild(dot);
  ledEls.push(dot);
}
// Display the last complete matrix scan
// while scanning continues. After 100 ms
// without a new scan, display the current
// latched rows instead.
let ledScan = { id: -1, at: 0, rows: null };
function drawLeds(p) {
  const last = p.matrixScanCycles?.at(-1);
  if (last && last.id !== ledScan.id) ledScan = { id: last.id, at: performance.now(), rows: last.rows };
  const scanning = ledScan.rows && performance.now() - ledScan.at < 100;
  const plane = (name, row) => {
    if (!scanning) return p[name]?.[row] ?? 0;
    const image = ledScan.rows.find((r) => r.row === row);
    return image ? image[{ matrix: "red", matrixGreen: "green", matrixBlue: "blue" }[name]] : 0;
  };
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const bit = 0x80 >> col;
      const r = plane("matrix", row) & bit ? 255 : 0;
      const g = plane("matrixGreen", row) & bit ? 220 : 0;
      const b = plane("matrixBlue", row) & bit ? 255 : 0;
      ledEls[row * 8 + col].style.background = r || g || b ? `rgb(${r},${g},${b})` : "";
    }
  }
}

function drawGlcd(bytes, glcdState) {
  const d = glcdImage.data;
  const on = glcdState?.displayOn && glcdState?.graphicsOn && bytes;
  for (let row = 0, o = 0; row < 64; row += 1) {
    for (let col = 0; col < 128; col += 1, o += 4) {
      const lit = on && (bytes[row * 16 + (col >> 3)] & (0x80 >> (col & 7))) !== 0;
      d[o] = lit ? 32 : 200;
      d[o + 1] = lit ? 40 : 216;
      d[o + 2] = lit ? 90 : 240;
      d[o + 3] = 255;
    }
  }
  glcdBitmapCtx.putImageData(glcdImage, 0, 0);
  glcdCtx.imageSmoothingEnabled = false;
  glcdCtx.drawImage(glcdBitmap, 0, 0, glcdCanvas.width, glcdCanvas.height);
}

// ---- Serial terminal

function pullSerial(m) {
  if (m.serial.length === state.serialSeen) return;
  let text = "";
  for (let i = state.serialSeen; i < m.serial.length; i += 1) {
    const b = m.serial[i];
    if (state.escape) {
      // Skip ESC [ parameters and final byte.
      if (state.escape === 1) state.escape = b === 0x5b ? 2 : 0;
      else if (b >= 0x40 && b <= 0x7e) state.escape = 0;
      continue;
    }
    if (b === 0x1b) state.escape = 1;
    else if (b === 0x0a) text += "\n";
    else if (b === 0x08) text += "\b";
    else if (b >= 0x20 && b < 0x7f) text += String.fromCharCode(b);
  }
  state.serialSeen = m.serial.length;
  appendSerial(text);
}

function appendSerial(text) {
  let s = state.serialText;
  for (const ch of text) s = ch === "\b" ? s.slice(0, -1) : s + ch;
  state.serialText = s.length > 40000 ? s.slice(-30000) : s;
  const pre = $("serial");
  const atEnd = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent = state.serialText;
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}

// ---- Keyboard
// The page has one keyboard, as the TEC-1G has one matrix: a key typed
// anywhere on the page is a matrix key, whichever display was clicked,
// and Tecos or the program that reads the matrix decides what it means.
// Only the serial terminal, the phone keyboard and the page's own
// controls keep their keys. A key goes down at keydown and stays down
// while it is held; once let go it stays down until Tecos's scan takes
// it, or a short while after another reader, such as TBUG, has read it
// (src/keys.mjs). Keys typed together queue and go down one at a time.

function onKey(route) {
  return (e) => {
    const input = keyInput(e, route() === "matrix");
    if (input === null || !state.machine) return;
    e.preventDefault();
    queueInput(state.machine, input);
  };
}

$("serial").addEventListener("keydown", onKey(() => "serial"));
for (const id of ["tms", "glcd", "leds", "lcd"]) $(id).addEventListener("click", () => $(id).focus());

// Keys without a character of their own, such as Tab and the arrows,
// keep the Shift or Ctrl held with them, so Shift+Tab, Ctrl+Up and
// Ctrl+Esc reach a program that reads the matrix. F1 to F10 reach it as
// Fn with a digit, F10 as Fn+0, as on the TEC-1G, and the browser does
// not act on them. Page Up, Page Down, Home and End reach it as Fn with
// an arrow.
const MODS = { shift: 0, ctrl: 1, fn: 2 };
const CONTROL_KEYS = new Set(["Tab", "Enter", "Escape", "Backspace", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** The matrix key and modifier key event E stands for, its text input to queue, or null. */
function matrixKey(e) {
  const fn = /^F(10|[1-9])$/.exec(e.key), space = e.key === " ";
  const input = fn ? { text: fn[1] === "10" ? "0" : fn[1] } : space ? { text: " " } : keyInput(e, true);
  if (!input || input.via === "serial") return input && { input };
  if (input.key !== undefined) return input;
  const combo = getMatrixCombosForAscii(input.text.charCodeAt(0))
    .find((c) => !c.capsLock && c.modifier !== "alt" && !((space || fn) && c.modifier));
  if (!combo) return null;
  let mod = fn ? MODS.fn : MODS[combo.modifier];
  if (mod === undefined && (space || CONTROL_KEYS.has(e.key))) mod = e.shiftKey ? MODS.shift : e.ctrlKey ? MODS.ctrl : undefined;
  return { key: combo.row * 8 + combo.col, mod };
}

document.addEventListener("keydown", (e) => {
  // The serial pane, the phone field and the page's controls keep their keys.
  const t = e.target;
  if (!state.machine || t.id === "serial" || t.id === "phonekeys" || t.closest?.("input,select,textarea,button,label,a")) return;
  const k = matrixKey(e);
  if (!k) return;
  e.preventDefault();
  if (e.repeat) return; // The matrix doesn't repeat; a key held is one press.
  if (k.input) return queueInput(state.machine, k.input);
  state.machine.enqueueKey(k.key, k.mod);
  Object.assign(state.machine.pending.at(-1), { held: true, phys: e.code }); // Held until its keyup.
});
document.addEventListener("keyup", (e) => {
  const held = state.machine?.pending?.find((p) => p.held && p.phys === e.code);
  if (held) held.held = false;
});
window.addEventListener("blur", () => state.machine?.pending?.forEach((p) => { p.held = false; }));

// ---- Phones and tablets
// Open the touch keyboard by focusing a
// hidden text field when a screen or
// terminal is tapped. Route its input
// through onKey for the tapped target.
// Keep one space for Backspace to delete.
// Compare each edit, then reset the field.
// Extra buttons supply missing keys.
// The next key clears the Ctrl latch.
// Apply Ctrl only to a character key.

const phone = { target: "matrix", pointer: "", ctrl: false };
const phoneInput = $("phonekeys");
const PHONE_REST = " ";
let phoneSent = PHONE_REST;

function phoneKey(key, ctrlHeld = false) {
  const ctrlKey = (ctrlHeld || phone.ctrl) && key.length === 1;
  if (phone.ctrl) setCtrl(false);
  onKey(() => phone.target)({ key, ctrlKey, metaKey: false, altKey: false, preventDefault() {} });
}

function setCtrl(on) {
  phone.ctrl = on;
  $("touchkeys").querySelector('[data-key="Control"]').setAttribute("aria-pressed", String(on));
}

function phoneRest() {
  phoneInput.value = PHONE_REST;
  phoneInput.selectionStart = phoneInput.selectionEnd = PHONE_REST.length;
  phoneSent = PHONE_REST;
}

// Convert the changed suffix to keys:
// Backspace for each removed character,
// then each new character. This handles
// replacements during word composition.
function phoneEdited() {
  const now = phoneInput.value;
  let same = 0;
  while (same < now.length && same < phoneSent.length && now[same] === phoneSent[same]) same += 1;
  for (let i = same; i < phoneSent.length; i += 1) phoneKey("Backspace");
  for (const ch of now.slice(same)) phoneKey(ch === "\n" || ch === "\r" ? "Enter" : ch);
  phoneSent = now;
}

function phoneFocus(el, target) {
  phone.target = target;
  const box = el.getBoundingClientRect();
  phoneInput.style.top = `${box.top + window.scrollY}px`;
  phoneInput.style.left = `${box.left + window.scrollX}px`;
  phoneRest();
  phoneInput.focus({ preventScroll: true });
  el.after($("touchkeys"));
}

for (const [id, target] of [["tms", "matrix"], ["glcd", "matrix"], ["leds", "matrix"], ["serial", "serial"]]) {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => {
    phone.pointer = e.pointerType;
  });
  el.addEventListener("click", () => {
    if (phone.pointer === "touch") phoneFocus(el, target);
  });
}

phoneInput.addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229) return; // Composition uses input events.
  // Route named keys and characters to
  // the target selected by the last tap.
  const ctrlKey = e.ctrlKey || (phone.ctrl && e.key.length === 1);
  if (keyText({ key: e.key, ctrlKey, metaKey: e.metaKey, altKey: e.altKey }) === null) return;
  e.preventDefault();
  phoneKey(e.key, e.ctrlKey);
});
phoneInput.addEventListener("beforeinput", (e) => {
  if (e.isComposing) return;
  if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") {
    e.preventDefault();
    phoneKey("Enter");
  }
});
phoneInput.addEventListener("input", (e) => {
  phoneEdited();
  if (!e.isComposing) phoneRest();
});
phoneInput.addEventListener("compositionend", () => {
  phoneEdited();
  phoneRest();
});

for (const button of $("touchkeys").querySelectorAll("button")) {
  button.addEventListener("mousedown", (e) => e.preventDefault()); // Retain text-field focus.
  button.addEventListener("click", () => {
    if (button.dataset.key === "Control") setCtrl(!phone.ctrl);
    else phoneKey(button.dataset.key);
    if (document.activeElement !== phoneInput && phone.pointer === "touch") phoneInput.focus({ preventScroll: true });
  });
}

// Expose PICO9918 text rows to tests.
globalThis.tecos = { screen: () => state.machine?.screen() ?? [] };

// ---- Card

function cardInfo() {
  try {
    return parseContainer(state.card);
  } catch (e) {
    fileProblem(`Card is not a valid container: ${e.message}`);
    return null;
  }
}

/**
 * Each drive's volume, A: to D:, as M
 * has it: a descriptor index plus one,
 * 0 for none. CD changes them, and a
 * reset keeps them, so the card's own
 * mounts can be out of date. Null when
 * they can't be read: before startup,
 * or while a program has EXPAND 1 in
 * the window that holds them.
 */
function liveDrives(m) {
  const at = m.symbols.get("DRVIDX");
  const pos = m.symbols.get("STPOS");
  // TNMOUNT removes the old selection before publishing the new one. A frame
  // may end between those writes: treating that transient zero as a finished
  // unmount can move the file selector to another drive. Use the input-wait
  // boundary for the live mapping; a failed flush can still leave dirty data.
  if (!m.waitingForInput() || at === undefined || pos === undefined || m.sysCtrl & 0x04 || m.read(pos) < 0x80) return null;
  return [0, 1, 2, 3].map((d) => m.read(at + d));
}

function copyVolume(drive) {
  const live = state.card && state.machine && liveDrives(state.machine);
  const index = live?.[drive.charCodeAt(0) - 65];
  return index ? parseContainer(state.card).volumes[index - 1] : null;
}

function refreshCopyAvailability() {
  let ready = false;
  if (!state.lifecyclePending) {
    try { ready = Boolean(copyVolume($("drive").value)); }
    catch { /* The import guard reports invalid card details on submission. */ }
  }
  $("putfile").disabled = !ready;
  const text = ready ? "Copy available; copying resets the machine."
    : state.lifecyclePending ? "Copy unavailable during a card operation."
    : "Copy unavailable; wait for console input and a selected drive.";
  setText("copyavailability", text);
}

/** INFO's volumes, each with the drive it is on: the running machine's, else the card's. */
function drivesOf(info) {
  const live = state.drives;
  if (!live || live.some((i) => i > info.volumes.length)) return info.volumes.map((v) => ({ v, drive: v.drive }));
  return info.volumes.map((v, i) => {
    const d = live.indexOf(i + 1);
    return { v, drive: d < 0 ? null : String.fromCharCode(65 + d) };
  });
}

/** The volume on drive LETTER of INFO's card, or undefined. */
function volumeOn(info, letter) {
  return drivesOf(info).find((x) => x.drive === letter)?.v;
}

function refreshCard() {
  const info = cardInfo();
  if (!info) return;
  const drives = drivesOf(info);
  $("cardinfo").textContent =
    drives.map(({ v, drive }) => `${drive ?? "-"}: ${v.label} (${v.g.name}${v.readOnly ? ", read-only" : ""})`).join("   ");
  const select = $("drive");
  const current = select.value;
  select.innerHTML = "";
  for (const { v, drive } of drives.filter((x) => x.drive).sort((x, y) => x.drive.localeCompare(y.drive))) {
    const opt = document.createElement("option");
    opt.value = drive;
    opt.textContent = `${drive}: ${v.label}`;
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === current)) select.value = current;
  refreshFiles();
}

function currentVolume() {
  const info = cardInfo();
  const v = info && volumeOn(info, $("drive").value);
  return v ? new CpmVolume(volumePayload(state.card, v), v.g, { readOnly: v.readOnly }) : null;
}

function refreshFiles() {
  const fs = currentVolume();
  const body = $("filelist").querySelector("tbody");
  body.innerHTML = "";
  if (!fs) return;
  for (const f of fs.list()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${f.user}</td><td>${f.name}</td><td>${f.bytes}</td><td><button>Download</button></td>`;
    tr.querySelector("button").addEventListener("click", () => {
      let bytes;
      try {
        bytes = fromCard($("textmode").value, f.name, fs.read(f.name, { user: f.user }));
      } catch (err) {
        fileProblem(`Not downloaded: ${err.message}`, "download"); // Report the damaged entry.
        return;
      }
      download(bytes, f.name);
    });
    body.appendChild(tr);
  }
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes]));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function useCard(image, options = choices()) {
  parseContainer(image);
  await powerOnNow(options, image);
  clearFileProblem("open");
}

/** Report a card that couldn't be opened, or that replaced the old one and then failed to start. */
function notOpened(err) {
  fileProblem(`${err.published ? "Card replaced; restart failed" : "Not opened"}: ${err.message}`, "open");
}

$("starter").addEventListener("click", () => {
  const options = choices();
  return lifecycle(async () => useCard(await starterCard(), options))
    .catch(notOpened);
});
$("saveimg").addEventListener("click", () => state.card && download(state.card, "tecos-card.img"));
$("openimg").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const options = choices();
  e.target.value = "";
  return lifecycle(async () => useCard(new Uint8Array(await file.arrayBuffer()), options))
    .catch(notOpened);
});
$("putfile").addEventListener("change", (e) => {
  const files = Array.from(e.target.files ?? []);
  const drive = $("drive").value;
  const mode = $("textmode").value;
  e.target.value = "";
  if (!files.length) return;
  return lifecycle(async () => {
    if (!state.card) throw new Error("no card");
    const machine = state.machine;
    const volume = copyVolume(drive);
    if (!volume) throw new Error("the live drive selection is unavailable; try at the command prompt");
    const staged = state.card.slice();
    const fs = new CpmVolume(volumePayload(staged, volume), volume.g, { readOnly: volume.readOnly });
    for (const file of files) {
      const name = file.name.toUpperCase();
      const bytes = new Uint8Array(await file.arrayBuffer());
      fs.write(name, bytes, { text: chooseText(mode, name, bytes) });
    }
    state.machine = null;
    state.machineGeneration++;
    let published = false;
    try {
      await persistence.commit(staged);
      published = true;
      state.machine = machine;
      reset();
      clearFileProblem("copy");
      refreshFiles();
    } catch (error) {
      if (published) {
        state.machine = null;
        fileProblem(`Files copied; restart or refresh failed: ${error.message}`, "copy");
        return;
      }
      state.machine = machine;
      throw error;
    }
  }).catch(err => fileProblem(`Not copied: ${err.message}`, "copy"));
});
$("drive").addEventListener("change", () => {
  refreshFiles();
  refreshCopyAvailability();
});

// ---- Controls

/** Say why a restart from the controls didn't happen, or failed after the card was updated. */
function notRestarted(err) {
  fileProblem(`${err.published ? "Card updated; restart failed" : "Not restarted"}: ${err.message}`);
}

$("display").value = state.display;
$("display").addEventListener("change", (e) => {
  const options = { ...choices(), display: e.target.value };
  return powerOn(options)
    .then(() => { localStorageSet("tecos.display", options.display); (options.display === "tms" ? $("tms") : $("glcd")).focus(); })
    .catch(notRestarted);
});
$("profile").value = state.width;
$("profile").addEventListener("change", (e) => {
  const options = { ...choices(), width: e.target.value };
  return powerOn(options).then(() => localStorageSet("tecos.width", options.width)).catch(notRestarted);
});
$("reset").addEventListener("click", () => lifecycle(() => {
  reset();
  refreshFiles();
}).catch(err => fileProblem(`Reset failed: ${err.message}`)));
$("power").addEventListener("click", () => powerOn().catch(notRestarted));
$("pause").addEventListener("click", () => {
  state.running = !state.running;
  $("pause").textContent = state.running ? "Pause" : "Run";
});
setInterval(refreshFiles, 5000);

// ---- Start

const initialOptions = choices();
const startup = lifecycle(async () => {
  let stored = false;
  try {
    state.card = await loadCard();
    if (state.card) { parseContainer(state.card); stored = true; }
  } catch {
    state.card = null;
    persistence.protectedRecord = true;
  }
  state.card ??= await starterCard();
  persistence.adopt(state.card, { stored });
  await powerOnNow(initialOptions);
  await persistence.autosave();
  refreshCard();
  requestAnimationFrame(frame);
  // An async startup may finish after the user has focused the phone keyboard
  // or another control. Only supply default focus while none was selected.
  if (document.activeElement === document.body) $("tms").focus();
}).catch(err => fileProblem(`Startup failed: ${err.message}`, "startup"));
