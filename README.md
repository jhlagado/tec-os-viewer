# TEC-OS viewer

A TEC-1G running TEC-OS in a web page, with the cards and recipes that load it: the demo system for TEC-OS and its programs.

[Open the live demo](https://jhlagado.github.io/tec-os-viewer/).
GitHub Pages serves the standalone build from the `gh-pages` branch. Its
[build details](https://jhlagado.github.io/tec-os-viewer/build-info.json) identify
the Viewer source and firmware pin. Changes to `main` need a new demo build
before they appear on that site.

[Reading the source](docs/reading.md) follows page startup, the controls, card
storage and the build through their files.

New sessions use 40 columns. Saved 32, 40 or 80-column preferences are retained.
The width selector still provides all three choices. Missing, invalid or
unavailable saved preferences use 40 columns.

The firmware pin is TEC-OS main `be654b3`, on the release 1 candidate with
BASIC: the Compact font, a cold 40-column console, `DEL` beside `ERA`, the
squeezed ROM, `MON3.SVC` for MON-3's programs, TED from Thorium `b69d544`,
TAS from Thorium `3d1e2c0`, which takes several statements on a line, and
BAZA from Baza `45b138e`, with the Compact font's notices shipped beside and
inside the page. TEC-OS builds one card, and the page runs it: the starter
card's 15 files, `BAZA.COM`, `BAZA.RTL`, `BOUNCE.BAS`, `CHAIN.ASM`,
`DEMO.ASM`, `GLCD.SVC`, `HELLO3.ASM`, `HELLO3.BIN`, `MON3.SVC`, `MOUNT.COM`,
`SAMPLE.ASM`, `STARTUP.CMD`, `TAS.COM`, `TED.COM` and `TIMES.BAS`. At `A>`,
`TAS DEMO` then `DEMO` build and run the hardware demo, and `TED DEMO.ASM`
reads it; `TAS SAMPLE` and `SAMPLE` build and run a first program,
`BAZA TIMES` and `TIMES` one in BASIC, and `BAZA BOUNCE` and `BOUNCE` a sprite
game on the PICO9918: tap W, A, S and D to steer, Q to quit. `MON3.SVC /E` gives
`MON3>`, where `LOAD HELLO3.BIN` and `GO` run `HELLO3`, a MON-3 program that
writes four lines on the LCD and counts on the digits; on the page, Esc on
the matrix keyboard returns to `MON3>` (on the board, AD on its keypad does
too), and `EXIT` to `A>`. `TAS CHAIN` then
`CHAIN` print `LINE 1` to `LINE 5` from `CHAIN.ASM`, which is written with
several statements on a line, a `\` between them. Its lines are up to 67
columns: choose 80 in the width selector and `TED CHAIN.ASM` shows them
whole. At 40 columns TED scrolls sideways along them. A browser that already
holds a card keeps it; press New starter card for this one.
[Qualification](docs/qualification.md) records the pin, its ROM and the tests
that pass on it.

TEC-OS is a submodule at `tec-os/`, and its commit there is the pin. The page imports TEC-OS's machine, card and recipe libraries
from it and holds no copy of them. The viewer installs nothing of its own: the runtime, esbuild and Playwright resolve from
`tec-os/node_modules`, which `npm run tecos` installs. `pins.json` holds the SHA-256 of the ROM, of each file on the card and of the starter recipe's canonical form,
as TEC-OS's build at the pin gives them.

`npm run tecos` needs read access to four repositories: jhlagado/tec-os, the `tec-os` submodule, at the pin, and the three its
inputs come from, at the commits TEC-OS's `test/inputs.json` pins: jhlagado/thorium (`3d1e2c0` for `TAS.COM` and `CHAIN.ASM`,
`b69d544` for `TED.COM`), jhlagado/baza (`45b138e`) and jhlagado/debug80-tec1g-mon3 (`000c052`, MON-3's ROM and sources). Without
that access, supply the inputs in `tec-os/.inputs/`, or use the [live demo](https://jhlagado.github.io/tec-os-viewer/).

```
git clone --recurse-submodules https://github.com/jhlagado/tec-os-viewer.git
TECOS_ROM_ASSEMBLER=atom npm run page
npm start
```

Open `http://localhost:8765`. For an existing build, just run `npm start`.
The local server uses esbuild from the submodule; Python is not needed.

The Viewer selects ATOM explicitly for its ROM build and passes that selection to subprocesses.
An unavailable ATOM stops the build. TEC-OS also documents a TAS default and its host/compiler
inputs in its README. This Viewer qualification uses ATOM.

- `TECOS_ROM_ASSEMBLER=atom npm run tecos` builds TEC-OS's ROM and media in the submodule and stops, naming the cause, if the submodule has changes or what
  it made differs from `pins.json`. That includes the ROM, the card's files and the starter recipe, which is pinned in full by its
  canonical digest. It runs TEC-OS's `npm run inputs` first, which takes the inputs TEC-OS's `test/inputs.json` pins, among them
  `TAS.COM`, `TED.COM` and `CHAIN.ASM` from Thorium, `BAZA.COM`, `BAZA.RTL` and `BOUNCE.BAS` from Baza and MON-3's ROM and sources,
  each from its variable there (`TAS_COM`, `CHAIN_ASM` and the rest) when set, else `tec-os/.inputs/`, else a pinned sibling checkout
  beside `tec-os/`, as TEC-OS's README says, else fetches it, and refuses any that differs from its pin. To supply the files
  without fetching them, put them in `tec-os/.inputs/` or name them in those variables.
- `npm run web` bundles the page into `dist/`, with the ROM, the card's files and `FONT-NOTICES.txt`; the font notices also appear in the
  page. It writes `dist/build.json` last, naming both commits, whether each tree was clean and every file's hash.
- `npm run page` runs both, then writes `dist/tec-os-viewer.html`, one page with everything embedded, labelled with this
  repository's commit and TEC-OS's. It refuses, naming the cause, unless `dist/build.json` records a clean build of the current
  commits and every file in `dist/` still matches it.
- `npm test` runs every test; `npm run quick` runs the bundle and the serial board's boot, in seconds. Both need `npm run tecos` first.
