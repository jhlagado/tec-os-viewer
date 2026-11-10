# Reading the viewer

This repository connects a browser page to the TEC-1G machine model and TEC-OS
firmware. The page code is here. Firmware implementation and the shared
machine, card and file-system libraries are in the `tec-os/` submodule.

## 1. Establish the version

The gitlink at `tec-os/` selects firmware commit
`31b60837d24cf801b5e8cf4daa4856f520227795`, TEC-OS main, the release 1
candidate with BASIC: the Compact font, a 40-column cold console, `DEL`
beside `ERA`, TED with its language table, and BAZA from Baza `747b9a7`. Its
`SAMPLE.ASM` is the same 40-column sample earlier pins carried. Its starter
card holds `BAZA.COM`, `BAZA.RTL` and `TIMES.BAS`, and the page's card adds
`DEMO.ASM`, the hardware demo's source, and Baza's `BOUNCE.BAS`: `TAS DEMO`
then `DEMO` build and run the demo.
[Qualification](qualification.md) records the accepted viewer baseline.
[pins.json](../pins.json) holds the expected ROM, card-file and canonical
recipe digests.
ROM means read-only memory, containing the firmware image.

The [Compact font and cold 40-column offer](compact-source-offer.md) is
received in this pin. The page retains a saved width of 32, 40 or 80
columns and uses 40 when that preference is missing, invalid or unavailable.
A newer firmware checkout elsewhere does not change this page's dependency.

## 2. Follow page startup

[index.html](../index.html) defines the controls and screen elements.
[style.css](../style.css) supplies their presentation.
[src/main.mjs](../src/main.mjs) connects the elements to machine state.
Its final startup block loads the saved card or makes a starter card, attempts
to save it, powers on the machine and starts the animation loop.

`starterCard` fetches a recipe and builds its card through the shared library.
`powerOnNow` prepares that card for the selected display and width, loads the
ROM and symbols, then creates a `Machine`. The frame loop steps that machine
and renders its state. Reset calls the existing machine's reset method.
Power cycle creates a new machine with the current card.

The width and display preferences use browser localStorage. The card image
uses IndexedDB, a separate browser database.

## 3. Connect the controls to the display

The rendering, keyboard and controls sections in `main.mjs` contain the page's
event handlers. Screen input uses the matrix-keyboard route and serial-terminal
input uses the serial route. Touch input passes through the hidden text field
and the extra keys defined in `index.html`.

[src/tms.mjs](../src/tms.mjs) renders 80-column text, 40-column text and
Graphics I from video registers and video memory. Other modes use the runtime's
framebuffer. `main.mjs` also draws the front-panel digits, lights and displays.
PICO9918 is the main video display. GLCD is the graphics liquid crystal display.
The firmware's console and device routines remain in `tec-os/src/` and
`tec-os/drivers/`.

## 4. Trace a card change

The card section in `main.mjs` lists files, downloads images and stages imported
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

[src/store.mjs](../src/store.mjs) loads and saves the image in IndexedDB.
Machine card writes mark it dirty for periodic saving. A failed save leaves
an unsaved indication and a copy in memory. A failed stored-card read leaves
the original record alone and runs a starter card without saving over it.
The Download image control provides a file copy.

## 5. Follow the build and its checks

[package.json](../package.json) names the commands. Their implementation is:

- [tools/tecos.mjs](../tools/tecos.mjs): build firmware and media with ATOM,
  then check the submodule pin, clean state, ROM/card-file digests and the
  starter recipe, structurally and by its pinned canonical digest.
- [tools/build.mjs](../tools/build.mjs): bundle `src/main.mjs` with esbuild and
  copy the page, ROM, derived symbols, recipe and card files into `dist/`.
  It validates and ships the font notices, beside the page and inline, and
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
[single-page](../test/single-page.test.mjs) covers standalone delivery.
The shared setup in [test/lib/page.mjs](../test/lib/page.mjs) relates generated
assets to the machine and card helpers.

The separate [qualification engineering sources](../tools/qualification/README.md)
are inactive work. They are outside the ordinary test command and supply no
new native qualification.
