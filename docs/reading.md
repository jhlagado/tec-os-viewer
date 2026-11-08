# Reading the viewer

This repository connects a browser page to the TEC-1G machine model and TEC-OS
firmware. The page code is here. Firmware implementation and the shared
machine, card and file-system libraries are in the `tec-os/` submodule.

## 1. Establish the version

The gitlink at `tec-os/` selects firmware commit
`c8c4a3e3ecfdd6c06c1d2c332ab1be9b0c7a5d4c`, a sample-only child of the
previous `fe2097f4` pin. Its reformatted `SAMPLE.ASM` is the only firmware source
change. Viewer qualification of this update is pending.
[Qualification](qualification.md) records the accepted viewer baseline.
[pins.json](../pins.json) holds the expected ROM and card-file digests.
ROM means read-only memory, containing the firmware image.

The later [Compact font and cold 40-column offer](compact-source-offer.md)
is separate receiving work. The current page defaults to 80 columns when no
width is saved. A newer firmware checkout elsewhere does not change this page's
dependency.

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

[src/store.mjs](../src/store.mjs) loads and saves the image in IndexedDB.
Machine card writes mark it dirty for periodic saving. A failed save leaves
an unsaved indication and a copy in memory. A failed stored-card read leaves
the original record alone and runs a starter card without saving over it.
The Download image control provides a file copy.

## 5. Follow the build and its checks

[package.json](../package.json) names the commands. Their implementation is:

- [tools/tecos.mjs](../tools/tecos.mjs): build firmware and media with ATOM,
  then check the submodule pin, clean state and ROM/card-file digests.
- [tools/build.mjs](../tools/build.mjs): bundle `src/main.mjs` with esbuild and
  copy the page, ROM, derived symbols, recipe and card files into `dist/`.
  Dependencies resolve from `tec-os/node_modules`.
- [tools/page.mjs](../tools/page.mjs): embed that distribution's assets into
  `dist/tec-os-viewer.html`. Its fetch shim supplies embedded files. It rejects
  a changed viewer tree and labels the page with both repository commits.

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
