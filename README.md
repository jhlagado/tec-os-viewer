# TEC-OS viewer

A TEC-1G running TEC-OS in a web page, with the cards and recipes that load it: the demo system for TEC-OS and its programs.

[Reading the source](docs/reading.md) follows page startup, the controls, card
storage and the build through their files.

The checked-in firmware pin is the [VS2 qualified baseline](docs/qualification.md).
The later [Compact font and cold 40-column firmware offer](docs/compact-source-offer.md)
has not yet been adopted or qualified by this viewer. Those documents also identify
pending viewer work and its source records.

TEC-OS is a submodule at `tec-os/`, and its commit there is the pin. The page imports TEC-OS's machine, card and recipe libraries
from it and holds no copy of them. The viewer installs nothing of its own: the runtime, esbuild and Playwright resolve from
`tec-os/node_modules`, which `npm run tecos` installs. `pins.json` holds the SHA-256 of the ROM and of each file on the page's card, as TEC-OS's build
at the pin gives them.

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
  it made differs from `pins.json`. With `TAS_COM` and `TED_COM` set, it reads the Thorium inputs from them; otherwise it fetches them.
- `npm run web` bundles the page into `dist/`, with the ROM and the card's files.
- `npm run page` runs both, then writes `dist/tec-os-viewer.html`, one page with everything embedded, labelled with this
  repository's commit and TEC-OS's.
- `npm test` runs every test; `npm run quick` runs the bundle and the serial board's boot, in seconds. Both need `npm run tecos` first.
