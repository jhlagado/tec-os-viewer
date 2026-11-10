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

The firmware pin is TEC-OS main `31b6083`, the release 1 candidate with BASIC
(Origo KD-262): the Compact font, a cold 40-column console, a `DEL` command
beside `ERA`, TED from Thorium `b69d544`, which builds a `.BAS` with BAZA, and
BAZA from Baza `747b9a7`, with `DEF CALL`, `CALL`, `REG` and `VARPTR`, with
the Compact font's notices shipped beside and inside the page. The page's card
is the starter card's nine files, `BAZA.COM`, `BAZA.RTL`, `GLCD.SVC`,
`MOUNT.COM`, `SAMPLE.ASM`, `STARTUP.CMD`, `TAS.COM`, `TED.COM` and
`TIMES.BAS`, plus `DEMO.ASM`, the hardware demo's source, and Baza's
`BOUNCE.BAS`. At `A>`, `TAS DEMO` then `DEMO` build and run the demo, and
`TED DEMO.ASM` reads it; `TAS SAMPLE` and `SAMPLE` build and run a first
program, `BAZA TIMES` and `TIMES` one in BASIC, and `BAZA BOUNCE` and `BOUNCE`
a sprite game on the PICO9918: tap W, A, S and D to steer, Q to quit. A
browser that already holds a card keeps it; press New starter card for this
one.
[Qualification](docs/qualification.md) records the pin, its ROM and the tests
that pass on it.

TEC-OS is a submodule at `tec-os/`, and its commit there is the pin. The page imports TEC-OS's machine, card and recipe libraries
from it and holds no copy of them. The viewer installs nothing of its own: the runtime, esbuild and Playwright resolve from
`tec-os/node_modules`, which `npm run tecos` installs. `pins.json` holds the SHA-256 of the ROM, of each file on the page's card and of the page recipe's canonical form (the starter recipe plus `DEMO.ASM` and `BOUNCE.BAS`),
as TEC-OS's build at the pin gives them.

The `tec-os` submodule and the Thorium and Baza repositories its inputs come from are private, so a build needs access to all
three; without it, use the [live demo](https://jhlagado.github.io/tec-os-viewer/).

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
  it made differs from `pins.json`. That includes the ROM, the card's files and the page recipe, which is pinned in full by its canonical
  digest. It runs TEC-OS's `npm run inputs` first, which takes the five pinned inputs, `TAS.COM` and `TED.COM` from Thorium and
  `BAZA.COM`, `BAZA.RTL` and `BOUNCE.BAS` from Baza, from `TAS_COM`, `TED_COM`, `BAZA_COM`, `BAZA_RTL` and `BOUNCE_BAS` when set,
  else `tec-os/.inputs/`, else a pinned sibling checkout (`../thorium/dist/` or `../baza/` beside `tec-os/`, as TEC-OS's README
  says), else fetches them, and refuses any that differs from its pin. To supply the files without fetching them, put them in
  `tec-os/.inputs/` or name them in those variables.
- `npm run web` bundles the page into `dist/`, with the ROM, the card's files and `FONT-NOTICES.txt`; the font notices also appear in the
  page. It writes `dist/build.json` last, naming both commits, whether each tree was clean and every file's hash.
- `npm run page` runs both, then writes `dist/tec-os-viewer.html`, one page with everything embedded, labelled with this
  repository's commit and TEC-OS's. It refuses, naming the cause, unless `dist/build.json` records a clean build of the current
  commits and every file in `dist/` still matches it.
- `npm test` runs every test; `npm run quick` runs the bundle and the serial board's boot, in seconds. Both need `npm run tecos` first.
