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

The firmware pin is TEC-OS main `d556ec5`, which builds with TAS alone, on
the release 1 candidate with BASIC: the Compact font, a cold 40-column
console, the squeezed ROM with a minimal CCP and `SHELL.SVC`, the resident
shell, `MON3.SVC` for MON-3's programs, TED from Thorium `b69d544`, TAS from
Thorium `3d1e2c0`, which takes several statements on a line, and BAZA and
`BOUNCE.BAS` from Baza `50dc512`, with the card's `BOUNCE.BAS` and
`TIMES.BAS` in the BASIC style, and the Compact font's notices shipped beside
and inside the page. TEC-OS builds one card, and the page runs it: the starter
card's 15 files, `BAZA.COM`, `BAZA.RTL`, `BOUNCE.BAS`, `DEMO.ASM`,
`GLCD.SVC`, `HELLO3.ASM`, `HELLO3.BIN`, `MON3.SVC`, `MOUNT.COM`,
`SAMPLE.ASM`, `SHELL.SVC`, `STARTUP.CMD`, `TAS.COM`, `TED.COM` and
`TIMES.BAS`. The card's `STARTUP.CMD` loads `SHELL.SVC` first, so the shell
holds the prompt after every reset: `COPY`, `DEL` and `SERVICES`, the
`[more]` pager in `TYPE` and `DIR`, the history on ^W and ^N, and lines of
several commands, joined by `!` (always go on) or ` &` (go on if the last one
succeeded). The ROM's own prompt is CP/M 2.2's, with `DIR`, `ERA`, `REN`,
`TYPE`, `SAVE` and `USER`, and `CON` and `UNLOAD`; TEC-OS's
[docs/shell.md](https://github.com/jhlagado/tec-os/blob/d556ec5/docs/shell.md) has the rest. At `A>`,
`TAS DEMO` then `DEMO` build and run the hardware demo, and `TED DEMO.ASM`
reads it; `TAS SAMPLE` and `SAMPLE` build and run a first program,
`BAZA TIMES` and `TIMES` one in BASIC, and `BAZA BOUNCE` and `BOUNCE` a sprite
game on the PICO9918: tap W, A, S and D or the arrow keys to steer, Q to quit.
BAZA shows a spinner while it compiles. `MON3.SVC` gives
`MON3>`, where `LOAD HELLO3.BIN` and `GO` run `HELLO3`, a MON-3 program that
writes four lines on the LCD and counts on the digits; on the page, Esc on
the matrix keyboard returns to `MON3>` (on the board, AD on its keypad does
too), and `EXIT` to `A>`. A browser that already holds a card keeps it; press
New starter card for this one. A card from before the shell has no
`SHELL.SVC`, so it gives the ROM's bare prompt, with no `DEL`, `COPY`,
history, pager or joined lines, and TED's build comes back to `A>` in place
of TED.
[Qualification](docs/qualification.md) records the pin, its ROM and the tests
that pass on it.

TEC-OS is a submodule at `tec-os/`, and its commit there is the pin. The page imports TEC-OS's machine, card and recipe libraries
from it and holds no copy of them. The viewer installs nothing of its own: the runtime, esbuild and Playwright resolve from
`tec-os/node_modules`, which `npm run tecos` installs. `pins.json` holds the SHA-256 of the ROM, of each file on the card and of the starter recipe's canonical form,
as TEC-OS's build at the pin gives them.

`npm run tecos` needs read access to four repositories: jhlagado/tec-os, the `tec-os` submodule, at the pin, and the three its
inputs come from, at the commits TEC-OS's `test/inputs.json` pins: jhlagado/thorium (`3d1e2c0` for `TAS.COM`,
`b69d544` for `TED.COM`), jhlagado/baza (`50dc512`) and jhlagado/debug80-tec1g-mon3 (`000c052`, MON-3's ROM and sources). Without
that access, supply the inputs in `tec-os/.inputs/`, or use the [live demo](https://jhlagado.github.io/tec-os-viewer/).

```
git clone --recurse-submodules https://github.com/jhlagado/tec-os-viewer.git
npm run page
npm start
```

Open `http://localhost:8765`. For an existing build, just run `npm start`.
The local server uses esbuild from the submodule; Python is not needed.

TEC-OS builds its ROM, card files and services with TAS, Thorium's assembler, run on the host from Thorium's
runner. `npm run tecos` takes the runner from `TECOS_TAS_HOST` when set, else `tec-os/.inputs/tas-host`; when neither is
there it clones Thorium at the runner commit TEC-OS pins into `tec-os/.inputs/tas-host` and installs its dependencies, as
TEC-OS's README describes, and TEC-OS checks the runner against its pins.

- `npm run tecos` builds TEC-OS's ROM and media in the submodule and stops, naming the cause, if the submodule has changes or what
  it made differs from `pins.json`. That includes the ROM, the card's files and the starter recipe, which is pinned in full by its
  canonical digest. It runs TEC-OS's `npm run inputs` first, which takes the inputs TEC-OS's `test/inputs.json` pins, among them
  `TAS.COM` and `TED.COM` from Thorium, `BAZA.COM`, `BAZA.RTL` and `BOUNCE.BAS` from Baza and MON-3's ROM and sources,
  each from its variable there (`TAS_COM`, `BAZA_COM` and the rest) when set, else `tec-os/.inputs/`, else a pinned sibling checkout
  beside `tec-os/`, as TEC-OS's README says, else fetches it, and refuses any that differs from its pin. To supply the files
  without fetching them, put them in `tec-os/.inputs/` or name them in those variables.
- `npm run web` bundles the page into `dist/`, with the ROM, the card's files and `FONT-NOTICES.txt`; the font notices also appear in the
  page. It writes `dist/build.json` last, naming both commits, whether each tree was clean and every file's hash.
- `npm run page` runs both, then writes `dist/tec-os-viewer.html`, one page with everything embedded, labelled with this
  repository's commit and TEC-OS's. It refuses, naming the cause, unless `dist/build.json` records a clean build of the current
  commits and every file in `dist/` still matches it.
- `npm test` runs every test; `npm run quick` runs the bundle and the serial board's boot, in seconds. Both need `npm run tecos` first.
