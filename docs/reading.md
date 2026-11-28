# Reading the viewer

This repository connects a browser page to the TEC-1G machine model and Tecos
firmware. The page code is here. Firmware implementation and the shared
machine, card and file-system libraries are in the `tec-os/` submodule.

## 1. Establish the version

The gitlink at `tec-os/` selects firmware commit
`fe23fa7165a65a1c4670bbd61a25108fa996533a`, with every program on the card saying Tecos, whose banner says "Tecos 0.1 for TEC-1G", with TBUG from tbug `167f7f0` (`tbug NAME`, no ARM, no key repeats, the first stop in Code), a bare service name read from A: as a COM is, BOUNCE titled BAZ BASIC, BAZC, the BASIC compiler under its new name, `TAS.COM` on every A: volume, the CCP's own pager, line history, `CLS` and labelled prompt (ABI 5.6), Shift-Tab as back-tab, F1-F10 on Fn with a
digit key, Page Up, Page Down, Home and End on Fn with an arrow, Shift with an arrow sent as xterm sends it, the ROM's name parser exported as `TNPARSE` (ABI 5.4), TBUG with its symbols built in,
cooperative housekeeping and ROM CD recovery, built with TAS alone, on the
release 1 candidate with BASIC: the Compact font, a 40-column cold console,
the squeezed ROM with a small CCP and three drives, `SHELL.SVC`, the
9-page resident shell, whose `DIR`, `COPY` and `SERVICES` are read from its file as an overlay, with `CD`, the sized `DIR` and the prompt
`A:SYSTEM>`, TED from TED `b2f98bc` with F9 to build, F5 to run and its language table and its
session in `TED.SES`, `TED.ERR` and `TED.PRJ`, which keeps
the document on the card for files up to 65,535 bytes, TAS from TAS `f1e4dbc`
with chained lines and Intel HEX output, BAZC, the compiler, from Baza `3f31488` with
its runtime from the same commit, BOUNCE from `7beac04`, BAZ, the interpreter, from `3f31488`, and the 19-page
`MON3.SVC`. Tecos builds one card, the starter card, of five
volumes, and the page runs it. Its `STARTUP.CMD` loads `SHELL.SVC`, which then
holds the prompt: `CD`, `COPY`, `DEL`, `DIR` with a row of name and size for
each file, the `[more]` pager,
the history on Up/Down and ^W/^N, and lines joined by `!` and `&`. The card also holds
`MON3.SVC` and `HELLO3.ASM`, a small MON-3 program's source. At the CP/M
prompt, `TAS HELLO3 HELLO3.BIN` builds its binary, or `TAS HELLO3 HELLO3.HEX`
its Intel HEX; then `MON3.SVC`, `LOAD HELLO3.BIN` (or `LOAD HELLO3.HEX`) and
`GO` show HELLO3's four lines on the LCD. The ROM's
basic `CD` remains available if a reset starts without the shell: `CD ?`,
`CD A:SYSTEM` and `SHELL.SVC` restore the starter's shell.
[Qualification](qualification.md) records the dependency, receiving scope and historical baselines.
[pins.json](../pins.json) holds the expected ROM, card-file and canonical
recipe digests.
ROM means read-only memory, containing the firmware image.

The [Compact font and cold 40-column offer](compact-source-offer.md) is
received in this pin. The page retains a saved width of 32, 40 or 80
columns and uses 40 when that preference is missing, invalid or unavailable;
a new session starts at 40.
A newer firmware checkout elsewhere does not change this page's dependency.

## 2. Follow page startup

[index.html](../index.html) defines the controls and screen elements.
[style.css](../style.css) supplies their presentation.
[src/main.mjs](../src/main.mjs) connects the elements to machine state.
Its final startup block owns the first lifecycle turn: it loads and validates
the saved card or makes a starter, prepares the card and powers on the machine,
attempts browser persistence, then starts the animation loop.

`starterCard` fetches a recipe and builds its card through the shared library.
`powerOnNow` prepares that card for the selected display and width, loads the
ROM and symbols, then creates a `Machine`. The frame loop steps that machine
and renders its state. Lifecycle requests queue before file/fetch awaits, so a
slow earlier request cannot publish over a later choice. Guest execution is
suppressed during each turn; the user's Pause/Run intent remains separate.
Reset calls the existing machine's reset method. Power cycle creates a new
machine with the current card. Columns and Display use that power-on path.

The width and display preferences use browser localStorage. The card image
uses IndexedDB, a separate browser database.

## 3. Connect the controls to the display

The rendering, keyboard and controls sections in `main.mjs` contain the page's
event handlers. The page has one keyboard, as the TEC-1G has one matrix: a key
typed anywhere on the page takes the matrix-keyboard route, whichever display
was clicked, and only the serial terminal, the phone keyboard and the page's
controls keep their keys, the serial terminal by the serial route. [src/keys.mjs](../src/keys.mjs) says what each
browser key sends, an arrow on the screen being the matrix's own arrow key,
Shift with an arrow or Tab and the page keys that key held with Shift or Fn
(`queueInput` puts them in the machine's queue by `enqueueKey`),
and moves the queued keys on as the frame loop steps the machine. A matrix key
stays down while it is held, and once let go until Tecos's scan has read it,
or a twentieth of a second after another reader such as TBUG has read it; a
key held is one press, and keys typed together queue. Tecos scans the matrix only
while CON: is CRT: or UC1:. Under `CON TTY` or `CON BAT` the page holds a
matrix key for a tenth of a second and then lets it go, so a key nothing reads
doesn't hold up the keys behind it, and a key a MON-3 program read, whose
release nothing clears once the program ends, doesn't either. The next key
waits as long again with no key down, so a program that reads the matrix
itself never sees two keys go down back to back. Until startup is over, and on
CRT: and UC1:, keys wait for Tecos's scan. Touch input passes through the
hidden text field and the extra keys defined in `index.html`.

[src/tms.mjs](../src/tms.mjs) renders 80-column text, 40-column text and
Graphics I from video registers and video memory. Other modes use the runtime's
framebuffer. `main.mjs` also draws the front-panel digits, lights and displays.
PICO9918 is the main video display. GLCD is the graphics liquid crystal display.
The firmware's console and device routines remain in `tec-os/src/` and
`tec-os/drivers/`.

## 4. Trace a card change

The card section in `main.mjs` shows each volume on the drive the running
machine has it on, read from Tecos's `DRVIDX`, lists files, downloads images and stages imported
files on a copy. A successful import publishes the staged card and resets the
machine. Its storage step precedes publication when browser saving is enabled.
[src/text.mjs](../src/text.mjs) decides, for each file copied onto or off the
card, whether it is CP/M text. By default a file is text only when its bytes
are: printable ASCII with TAB, LF, FF and CR, and a final ^Z, plus bytes from
80h for a text type such as `.ASM`, `.BAS`, `.Z80` or `.TXT`. Text goes on with
CRLF line ends and ^Z padding. A file on the card comes off as text only when
nothing but ^Z and 00h follows its first ^Z, or, with no ^Z, when its 00h
padding lies within its last record; it comes off with LF line ends.
`.COM`, `.SVC`, `.RTL`, `.BIN` and any file with other bytes are copied as
they are. A short binary whose bytes all happen to be text can still pass
for text; "binary, as it is" copies it unchanged. The Copy as control forces text or
binary instead, for Copy file to drive and for Download.

[src/persistence.mjs](../src/persistence.mjs) serializes owned snapshots for
all save sources. Card epochs and revisions distinguish current bytes from an
older completed snapshot. Writer admission captures the token and an owned copy
before any asynchronous database open; later autosave intents coalesce rather
than retaining another full image each tick. Staged operations hold the writer
through transaction completion and synchronous publication. Obsolete machine
callbacks and continuations cannot dirty or resume a replacement image.

[src/store.mjs](../src/store.mjs) performs the actual IndexedDB operation. Save
success means transaction `oncomplete`, not request success. Only completion
for the still-current card token can produce the browser Saved label. Failures
remain visible during retry; an unreadable stored record is protected across
imports/replacements and the session remains in memory. File-operation errors,
card information and persistence feedback have separate display regions, so
periodic refreshes cannot erase a still-relevant saving failure.

[src/guest-cache.mjs](../src/guest-cache.mjs) passively observes selected normal
steps in the existing instruction loop. Its [binding profile](../src/guest-profile.json)
checks the full ROM, symbol map, opcode spans and physical-memory configuration.
It reads small cache metadata only at validated returns/default-input/report
boundaries; arbitrary PCs and mismatched state cannot invent a clean sample.
A nonlocal exit or custom hook can leave the last check stale. Observed errors
survive unrelated refreshes; host reset starts a new observation epoch. These
internal firmware symbols are not a public flush/status API.

Guest cache, current SD bytes and completed browser storage are separate facts.
Failed guest writes can remain pending at an input wait; neither a prompt nor
a zero count completes an application's unclosed file. The page's Download
image reads current card bytes and never drains RAM. While paused, browser
saving can complete but guest housekeeping cannot run. Copy deliberately resets
after successful host publication and can discard pending/unclosed guest work;
the nearby text describes that effect before activation.

## 5. Follow the build and its checks

[package.json](../package.json) names the commands. Their implementation is:

- [tools/tecos.mjs](../tools/tecos.mjs): build firmware and media with TAS,
  preparing its host runner when it is missing,
  then check the submodule pin, clean state, ROM/card-file digests and the
  starter recipe, structurally and by its pinned canonical digest.
- [tools/build.mjs](../tools/build.mjs): bundle `src/main.mjs` with esbuild and
  copy the page, ROM, derived symbols, recipe and card files into `dist/`.
  It checks the observer binding, validates and ships the font notices, beside the page and inline, and
  writes `dist/build.json` last. Dependencies resolve from `tec-os/node_modules`.
- [tools/page.mjs](../tools/page.mjs): embed that distribution's assets into
  `dist/tec-os-viewer.html`. Its fetch shim supplies embedded files. It labels
  the page with both repository commits only when `dist/build.json` shows a
  clean build of the current commits that still matches `dist/`.

`npm start` serves `dist/`. The README contains the build commands.

For test reading, [web-bundle](../test/web-bundle.test.mjs) checks browser
bundling and [boards](../test/boards.test.mjs) follows card boot on the supported
boards. [worked-example](../test/worked-example.test.mjs) follows the card's
sample through assembly and editing. [stored-cards](../test/stored-cards.test.mjs),
[page-boundaries](../test/page-boundaries.test.mjs) and
[web-store](../test/web-store.test.mjs) cover storage and import boundaries.
[single-page](../test/single-page.test.mjs) covers standalone delivery, and
[held-key](../test/held-key.test.mjs) the matrix keys under `CON TTY`, on CRT:
and at the GLCD board's start.
[persistence](../test/persistence.test.mjs) and
[store transactions](../test/store-snapshots.test.mjs) exercise writer/token
and transaction-completion boundaries. [Guest cache units](../test/guest-cache.test.mjs)
are distinct from [actual CPU returns](../test/guest-cache-runtime.test.mjs) and
[actual failure/callback traces](../test/guest-cache-errors-runtime.test.mjs).
[Browser pending data](../test/guest-save-feedback-browser.test.mjs) and
[real transactions/costs](../test/guest-save-transaction-browser.test.mjs) exercise
the actual page; representative cost bounds are recorded in the test fixture.
The shared setup in [test/lib/page.mjs](../test/lib/page.mjs) relates generated
assets to the machine and card helpers.

The separate [qualification engineering sources](../tools/qualification/README.md)
are inactive work. They are outside the ordinary test command and supply no
new native qualification.
