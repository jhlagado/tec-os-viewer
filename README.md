# TEC-OS viewer

A TEC-1G running TEC-OS in a web page, with the cards and recipes that load it: the demo system for TEC-OS and its programs.

[Open the live demo](https://jhlagado.github.io/tec-os-viewer/).
GitHub Pages serves the standalone build from the `gh-pages` branch. Its
[build details](https://jhlagado.github.io/tec-os-viewer/build-info.json) identify
the Viewer source and firmware pin. Changes to `main` need a new demo build
before they appear on that site.

The starter card includes Tutankhamen's Snake. At the TEC-OS prompt,
enter `MON3` (or `MON3.SVC`), then `LOAD SNAKE9.BIN` and `GO` at `MON3>`.
Click the RGB panel to route arrow keys to the matrix keyboard.
To rebuild the game, run `TAS SNAKE9 SNAKE9.BIN` from the TEC-OS prompt.

[Reading the source](docs/reading.md) follows page startup, the controls, card
storage and the build through their files.

New sessions use 40 columns. Saved 32, 40 or 80-column preferences are retained.
The **Columns** selector provides all three choices. Changing Columns or Display
restarts the machine and restores the card's default drives and startup. Missing, invalid or
unavailable saved preferences use 40 columns.

The firmware pin is TEC-OS `1518fb7`, TEC-OS integration 1, which builds with
TAS alone, on the release 1 candidate with BASIC: the Compact font, a cold
40-column console, the squeezed ROM with a minimal CCP and four equal drives,
`SHELL.SVC`, the resident shell, in 18 pages, `MON3.SVC` for MON-3's programs,
in 19 pages, TED from Thorium `02b63d8`, TAS from Thorium `b8a9994`, which takes
several statements on a line and writes Intel HEX, and BAZA from Baza `eee4ee6`
and `BOUNCE.BAS` from Baza `5f6b58d`, with the card's `BOUNCE.BAS` and
`TIMES.BAS` in the BASIC style, and the Compact font's notices shipped beside
and inside the page. TEC-OS builds one card, and the page runs it: the starter
card, 13 MiB, of five volumes, SYSTEM on A:, WORK on B:, PROJECTS on C:, and
GAMES and SPARE on no drive. A: holds its 17 files, `BAZA.COM`, `BAZA.RTL`,
`BOUNCE.BAS`, `DEMO.ASM`, `GLCD.SVC`, `HELLO3.ASM`, `MON3.SVC`,
`SAMPLE.ASM`, `SHELL.SVC`, `SNAKE9.ASM`, `SNAKE9.BIN`, `STARTUP.CMD`, `TAS.COM`, `TED.COM` and
`TIMES.BAS`, plus `CAVERNS.BAS` and `CAVERNS.TXT`; B: is an empty work disk. The card's `STARTUP.CMD` loads
`SHELL.SVC` first, so the shell holds the prompt when SYSTEM is selected on A:, and the
prompt names the drive and its volume, `A:SYSTEM>`. The shell has `CD`, which
changes the directory presented by a drive (`CD D:GAMES`, `CD ?` to list them), `COPY`, `DEL`,
`SERVICES`, `CLS`, `ECHO` and `PAUSE`, `DIR` with a row for each file, its
whole name and its size, as `SHELL.SVC       4224`, then the count, the bytes
and the drive's free space (`DIR /W` is the ROM's wide listing), the
`[more]` pager in `TYPE` and `DIR`, history on Up/Down and ^W/^N, and lines of
several commands, joined by `!` (always go on) or ` &` (go on if the last one
succeeded). The ROM's own prompt provides `CD`, `DIR`, `ERA`, `REN`,
`TYPE`, `CON` and `UNLOAD`; TEC-OS's
[docs/shell.md](https://github.com/jhlagado/tec-os/blob/1518fb7/docs/shell.md)
has the rest. The shell's approved eighteen-page allocation leaves 41,728 bytes of TPA
(the word at `0006h` is `A400h`). The additional page costs 256 bytes compared
with the earlier seventeen-page shell. Qualification remains in progress.
The hosted build details identify the version currently available online.
At `A:SYSTEM>`, `TAS DEMO` then `DEMO` build and run the
hardware demo, and `TED DEMO.ASM` reads it; `TAS SAMPLE` and `SAMPLE` build
and run a first program, `BAZA TIMES` and `TIMES` one in BASIC, and `BAZA
BOUNCE` and `BOUNCE` a sprite game on the PICO9918: tap W, A, S and D or the
arrow keys to steer, Q to quit. BAZA shows a spinner while it compiles.
Build the source-only example with `TAS HELLO3 HELLO3.BIN` first.
`MON3.SVC` gives `MON3>`, where `LOAD HELLO3.BIN` and `GO` run `HELLO3`, a
MON-3 program that writes four lines on the LCD and counts on the digits; on
the page, Esc on the matrix keyboard returns to `MON3>` (on the board, AD on
its keypad does too), and `EXIT` to `A:SYSTEM>`. `TAS HELLO3 HELLO3.HEX`
writes the program as Intel HEX instead, which `LOAD HELLO3.HEX` takes. `MON3.SVC`'s
loader passes over a HEX file's start-address record (type 05h), which TAS
doesn't write, and a bare `GO` starts at the lowest address loaded; while a
write is still pending `GO` prints `?` and starts nothing.

## BASIC Caverns

Select PICO9918 at **80 columns**, type `BAZA CAVERNS` to compile the supplied
source, then `CAVERNS` to play. The 35,968-byte executable is created on your
card; it is not preinstalled. `TYPE CAVERNS.TXT` gives instructions and
`TED CAVERNS.BAS` opens the author-refined BASIC source. The matching BAZA
compiler/runtime pair is on the card; compilation works with the shell resident.
The game includes its selected runtime rather than loading BAZA.RTL separately.
QUIT followed by N returns to the shell. Returning home banks treasures and
shows the score while permitting more exploration. Developer checkpoints are
separate from this public source-only disk; there is no in-game SAVE command.
The listing uses ten-step line numbers, uppercase keywords and lowercase
variables, leaving room for reader experiments. The assembly Caverns80
comparison remains development-only.

If this browser already holds a card, download it before selecting **New
starter card** to receive the refreshed files. Reloading alone preserves your
existing card. The firmware tests include a complete quest, a 54-room tour and
the exact TED copy/edit/save/build/run/reopen exercise; these are emulator
results. Physical-board and author gameplay review remain separate.

The card line under SD card and the Drive list show each volume on the drive
the running machine has it on, so after `CD D:GAMES` they show `D: GAMES`. A
reset keeps the drives as `CD` left them. After `CD A:GAMES`, a reset can
give the bare `A>` on GAMES. The ROM's `CD ?`, `CD A:SYSTEM` and `SHELL.SVC`
restore the shell. The prompt always returns to user area 0. Power cycle restores the card's default drives and startup.

A browser that already holds a card keeps it; press New starter card for
this one. A card with no `SHELL.SVC` on A: and no `MON3.SVC` that is entered
as it installs, as a card saved before the shell is, is brought up to date as
the page powers it on: it gets the starter card's `SHELL.SVC`, and the
starter's `MON3.SVC` in place of its own if it has one, and `SHELL.SVC` goes
first in `STARTUP.CMD`. The serial pane says what was written, and the card's
other files and its volumes are as they were. So taking off both `SHELL.SVC`
and `MON3.SVC` brings the shell back at the next power-on, while a card whose
`SHELL.SVC` alone was taken off keeps today's `MON3.SVC` and is left at the
ROM's bare prompt. If the files can't be written, a full A: for one, or the
starter card can't be fetched, the card boots without the shell and the serial
pane says why; the next power-on tries again.

The saving panel under SD card reports three separate stages:

- **Guest cache** reports a pending-block count at validated firmware boundaries.
  “Last check” describes an earlier observation; “unavailable” means the page
  cannot validate this firmware or memory state. A zero count does not prove
  that an application closed its file.
- **Card image** is the current emulated SD contents. File browsing and
  **Download image** read these bytes, excluding pending guest RAM and an
  application's unclosed buffers or directory information.
- **Browser storage** shows pending, saving, saved, failed or protected state.
  “Saved card image in this browser” follows a completed IndexedDB transaction
  for the current card bytes. It can appear alongside pending guest data.

The page attempts autosaves at two-second intervals; this is a retry opportunity,
not a completion deadline. A failed save leaves the card in memory and keeps its
failure visible while retrying. If a stored record cannot be read or parsed,
saving stays disabled to protect it, including after Open image, New starter
card or imports. Download image keeps the session's card bytes; reload retries
the protected read. Browser storage can fail or be cleared.

TEC-OS separately holds pending writes in the machine's memory. OS calls
prioritise that work, combining changes to the same block while queued.
Required input tries to drain pending writes before waiting. Failed acknowledged
data writes stay pending and are reported for retry. A rejected directory update
is not published; a prompt alone cannot certify a failed flush. Housekeeping is
cooperative: it cannot run while a program keeps the CPU without calling the OS.
It does not complete an application's unclosed file or promise crash-proof storage.
The page never advances a paused guest to inspect or flush it.

If disk state cannot be rebuilt, `Disk reset failed` / `Enter retries` waits
for Enter before normal commands resume. Reset, Power cycle, New starter card,
Open image, Copy file to drive and a change of Columns or Display restart the
machine and discard writes still in its RAM cache and unclosed application work.
Check and resolve disk errors before restarting. Copy file stages and saves the
changed card when browser saving is available, then resets the guest. New starter
card and Open image also replace the card. The saving panel reports stages rather
than an overall guarantee that every application change has been saved.

Copy is disabled while a card operation is running or the current drive selection
cannot be read safely. Its availability line is separate from save and error
status. If the guest leaves input wait while a file picker is open, Copy can
still refuse without reading the files or changing the card; return to console
input and select the files again. Availability does not certify a flushed cache.

[Qualification](docs/qualification.md) records the pin, its ROM and the tests
that pass on it.

TEC-OS is a submodule at `tec-os/`, and its commit there is the pin. The page imports TEC-OS's machine, card and recipe libraries
from it and holds no copy of them. The viewer installs nothing of its own: the runtime, esbuild and Playwright resolve from
`tec-os/node_modules`, which `npm run tecos` installs. `pins.json` holds the SHA-256 of the ROM, of each file on the card and of the starter recipe's canonical form,
as TEC-OS's build at the pin gives them.

`npm run tecos` needs read access to four repositories: jhlagado/tec-os, the `tec-os` submodule, at the pin, and the three its
inputs come from, at the commits TEC-OS's `test/inputs.json` pins: jhlagado/thorium (`b8a9994` for `TAS.COM`,
`02b63d8` for `TED.COM`), jhlagado/baza (`eee4ee6` for compiler/runtime, `5f6b58d` for BOUNCE) and jhlagado/debug80-tec1g-mon3 (`000c052`, MON-3's ROM and sources). Without
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

Browser tests normally use Playwright's installed Chromium. Where browser
downloads are unavailable, `TEST_CHROMIUM=/usr/bin/chromium npm test` selects
an installed real Chromium explicitly. Record its version with the test result;
this is not qualification of Playwright's separately distributed browser build.


For a complete strict run under Origo's shared memory guard, use
`TEST_CHROMIUM=/path/to/chromium npm run test:strict`. Each test entry file
runs once in a fresh Node process with the existing assertions and strict
input requirements. The enclosing guard covers the entire suite. Set
`TEST_REPORT_DIR` to a fresh empty directory to retain every per-file TAP
and the verified `full-suite.json` aggregate; otherwise a temporary directory
is created. Missing, changed, incomplete, failed or skipped evidence refuses
qualification. Normal `npm test` is unchanged.

Browser save and stored-card scenarios have individual entry files so each
scenario has its own process lifetime. Shared helpers register no tests.
Stored-card setup reuses its seed tab for a fresh application document after
the native storage transaction completes.
