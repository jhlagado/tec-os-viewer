# Current Caverns integration

The current TEC-OS gitlink is `5aacb5e`, with ROM SHA-256
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`.
Starter revision 16 contains sixteen files. The new files are the author-refined
original BASIC game's CAVBASIC.BAS, CAVBASIC.COM and CAVERNS.TXT. BAZA compiler
and runtime are pinned at `8578fe5`; executable size is 39,680 bytes. All exact
ROM, recipe and file identities are in `pins.json`.

The upstream source and integration branches are published. The firmware test
`test/caverns-ted.test.mjs` qualifies the exact edit/save/build/run/reopen cycle;
`test/caverns.test.mjs` qualifies native game completion and all 54 rooms.
Neither is physical TEC-1G evidence. Human gameplay review remains to be done.
The current integration passed 1,319 TEC-OS tests with no failures or skips,
134 Viewer tests with no failures or skips, and seven additional Caverns checks
with explicit 80-column selection. The standalone build was smoke-tested in
real Chromium before upload. Results and exact artifact identities are retained
in `evidence/caverns-2026-11-14/`. The public Pages host could not be reached
from this cloud workspace for a post-upload HTTP check; publishing-branch pushes
were verified. No physical-board or completed author-review claim is made.

The existing qualification below is retained as a historical baseline; its
older file counts, recipe digest and BAZA pin do not describe this update.

# Viewer qualification and source ownership

The viewer's firmware dependency is its `tec-os/` gitlink,
`46cf3f1f1c6ea7ff361a568672a41ab1a7e2c1ee`. It adds basic ROM `CD` recovery
and a source-only HELLO3 starter to the qualified shell-stage-2 baseline
`c4ec0f4950446f92b658643ee23b63e2c02bb33b`. Origo tracks this change's
receiving scope and qualification status in
`studies/p3-tec-os/stages/recovery-implementation.md` and the Viewer receiving
review. A newer dependency alone does not establish a new Viewer test result.

The pin retains TAS-only builds, the Compact font, a cold 40-column console,
TED from Thorium `a2fe556`, TAS `3d1e2c0` and Baza `50dc512`. Earlier pins
`b3134cfc`, `8b69e51a` and `1d21d363` introduced the current TED, cached
writes and resident shell respectively. Existing font notices remain.
`pins.json` binds the ROM, the card's 13 files and the starter recipe's
canonical digest. The ROM, card files, recipe and `starter.img`
(`b11cd5b0…`) are byte for byte those of TEC-OS's build at the pin.

The recovery change makes `CD`, `CD D:`, `CD ?`, `CD NAME` and `CD D:NAME`
available at the bare ROM prompt. CD changes the directory presented by a
drive without changing the current drive or user area. After `CD A:GAMES`
and Reset, `CD ?` lists SYSTEM with no drive, `CD A:SYSTEM` restores that
selection and `SHELL.SVC` reloads the shell. If needed, `USER 0` selects the
starter shell's user area first. Power cycle restores the card's default
drives. The shell keeps its labelled prompt and script protections.

The starter supplies HELLO3.ASM only. At the CP/M prompt,
`TAS HELLO3 HELLO3.BIN` creates its binary before entering MON3. An existing
user's HELLO3.BIN is preserved by the saved-card upgrade. This recovery pin
still has the earlier cache policy described below; cooperative housekeeping
is separate work.

The pin retains shell stage 2:

- **Four equal drives.** A: to D: each hold one of the card's volumes, or
  none. The shell's `CD` puts a volume on a drive: `CD NAME` on the drive you
  are on, `CD D:NAME` on another, `CD` alone and `CD D:` read the card again,
  and `CD ?` lists the volumes with their drives. The prompt names the drive
  and its volume, `A:SYSTEM>`; a drive with no volume shows `C:>`. A command
  not found on the current drive runs from A:. A reset keeps the drives as
  `CD` left them; after `CD A:GAMES`, a reset gives the bare `A>` there.
  The ROM CD recovery above restores SYSTEM; power off and on gives the
  card's default drives.
- **Write-behind on the logged drive.** The drive you are on keeps its writes
  in the block cache, and logging onto another drive or `CD` moves it. Every
  other volume coalesces its data writes: the one pending block is written at
  the next flush point, the file's close, any directory request, a write to
  another block, a console read, a warm boot, function 48 or a drive change.
  Every directory write writes the cache first, and every console read (BDOS
  1, 6 input, 10 and 11, and the BIOS's CONIN) writes every changed line, on
  every drive: whenever TEC-OS waits for a key, every drive is on the card.
- **Byte 15 reserved.** A volume no longer carries a written-behind mark:
  TEC-OS's `createContainer` refuses a volume that names `writeBehind`, and
  so does the Viewer's recipe check (`tools/tecos.mjs`), whose canonical
  digest no longer adds the field.
- **The shell's commands.** `DIR` lists each file with its size, then the
  count and bytes and the drive's free space; `DIR /W` is the ROM's wide
  listing. `CLS`, `ECHO` and `PAUSE` are new.
- **The four-drive starter card**, recipe revision 14: five volumes, SYSTEM
  (G1M) on A:, WORK (G8M) on B:, PROJECTS (G1M) on C:, and GAMES and SPARE
  (G1M) on no drive, 13 MiB in all, with no `MOUNT.COM`.

TEC-OS's `docs/shell.md`, `docs/recovery.md` and `docs/compatibility.md` at the
pin have the whole of it.

The page reads each drive's volume from the running machine, TEC-OS's
`DRVIDX` (a descriptor index plus one for each of A: to D:, 0 for none), once
a frame, when startup has taken STARTUP.CMD's first line and TEC-OS's RAM is
in the 8000h-BFFFh window, and shows it in the card line and the Drive list,
and uses it for the files listed and for Copy file to drive. So `CD D:GAMES`
shows `D: GAMES`. Until the machine's drives can be read after a power-on the
page shows the card's own mounts. The 13 MiB card is stored in IndexedDB,
downloaded and opened as before.

At power-on the page asks TEC-OS's `needsStarter` whether the card is from
before the shell: no `SHELL.SVC` in user 0 on A:, and no `MON3.SVC` that is
entered on install. If so it fetches the starter card and passes it to
`prepareCard`, which writes the starter's `SHELL.SVC`, and its `MON3.SVC` in
place of the card's own if it has one, puts `SHELL.SVC` first in
`STARTUP.CMD` and leaves every other file, and the card's volumes, as they
were: a card saved before the shell, of two volumes, keeps its two drives
and boots with the four-drive starter's shell. The page shows the note
`prepareCard` returns on the serial pane. If the files can't be written, a
full A: for one, the card boots without the shell and the note says so. If
the starter card can't be fetched, the card boots without the shell and the
page's own note says so and that the next power-on tries again. The page
keeps the starter card it fetched for the session, apart from the card in
use, so a refused upgrade doesn't fetch it again at each power-on. A card
whose `SHELL.SVC` the user took off has today's `MON3.SVC` and is left
without it; one with both taken off gets the shell back.

The page saves the machine's card image, in IndexedDB within two seconds of
the machine writing it and in Download image, and doesn't flush the cache
itself: the cache is the machine's memory, and only TEC-OS can write it to
the card. At the prompt, a console read, every drive is on the card, and in
what the page saves; while a program runs, what it wrote on the drive it is
logged on since it last waited for a key or wrote a directory, and at most
one block on each other drive, may not be. Reset, Power cycle, New starter
card, Open image, Copy file to drive and a width or display change start the
machine again and lose what the cache held, as a reset does on the board;
New starter card and Open image also replace the stored card. README says to
wait for the prompt.

The ROM's CCP is minimal: it runs a `.COM` or a `.SVC`, changes drive, has
CP/M's `DIR`, `ERA`, `REN`, `TYPE`, `SAVE` and `USER`, with `CON` and
`UNLOAD`, and reads one line of `A:STARTUP.CMD` after a reset. Basic `CD` is also in
ROM. `SHELL.SVC`, a
resident service on the card, takes the prompt through the ROM's shell hook
and holds the richer environment: `COPY`, `DEL`, `SERVICES`, `DIR` with sizes, `CLS`,
`ECHO` and `PAUSE`, the `[more]` pager in `TYPE` and `DIR`, the history on ^W
and ^N, `.CMD` scripts and the rest of `STARTUP.CMD`, and lines of several
commands. `!` always separates and the next piece runs whatever the last
returned; `&` after a blank separates and the next piece runs only if the
last didn't fail. The card's `STARTUP.CMD` is `SHELL.SVC` then `GLCD.SVC`. At
power-on the page prepares the card with TEC-OS's `prepareCard`, which, on a
card holding `SHELL.SVC`, keeps that line first and puts the display's line
after it. A service whose execution record asks to be entered is entered as
it installs, so `MON3.SVC` gives `MON3>`.

The ROM uses 15,312 of 16,384 bytes, 1,072 free, with SHA-256
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`.
The shared recovery allocation adds 36 fixed RAM bytes: CCP stack 48,
BDOS stack 64, BIOS stack 48 and a reserved two-byte return-PC slot. The starter card
asks for four drives, each with an allocation vector for an 8 MiB volume, so
its TPA is 46,533 bytes (`0100h–B6C4h`) with nothing loaded; with
`SHELL.SVC`, which now takes 15 pages, 42,496, and 41,728 with the GLCD's
driver too. A card of two volumes and no drives field still gives 47,237. A
`.COM` starts with HL=0100h and DE=0000h.

TEC-OS builds one card: the starter card and the card the page runs are the
same image. Its recipe, `id` `starter` at revision 14, has the canonical
SHA-256
`ce5da25d60fd7b480866ba9ebb114683222a4e80cc6468832bb0f849e1392623`
(VE-5). The page fetches it from TEC-OS's `dist/starter.recipe.json`; the
separate page recipe is gone. A:'s 13 files, with the first eight hex digits
of each SHA-256 and their file payload bytes (before record padding):

| File | SHA-256 | Bytes | From |
| --- | --- | --- | --- |
| `BAZA.COM` | `280ee372…` | 13,184 | Baza `50dc512`, self-extracting |
| `BAZA.RTL` | `14d7fd11…` | 12,032 | Baza `50dc512` |
| `BOUNCE.BAS` | `a8d0d013…` | 5,305 | Baza `50dc512`, as CP/M text |
| `DEMO.ASM` | `5b9adf63…` | 15,335 | TEC-OS, as CP/M text |
| `GLCD.SVC` | `ac040f75…` | 836 | TEC-OS |
| `HELLO3.ASM` | `7d05f115…` | 2,167 | TEC-OS, as CP/M text |
| `MON3.SVC` | `a4742967…` | 5,032 | TEC-OS |
| `SAMPLE.ASM` | `1bfd9696…` | 4,485 | TEC-OS, as CP/M text |
| `SHELL.SVC` | `5beea505…` | 3,660 | TEC-OS |
| `STARTUP.CMD` | `76b798ba…` | 22 | TEC-OS |
| `TAS.COM` | `e648a1d0…` | 10,343 | Thorium `3d1e2c0` |
| `TED.COM` | `c6c8374a…` | 12,335 | Thorium `a2fe556` |
| `TIMES.BAS` | `287f0237…` | 626 | TEC-OS, as CP/M text |

`SHELL.SVC` is rebuilt at this recovery pin with its generic `CD FAILED`
message. Apart from that file and removal of HELLO3.BIN, the recipe's file
payloads match c4ec0f4. `MOUNT.COM` is still absent. `TED.COM` and `HELLO3.ASM`
came at `b3134cfc`, `SHELL.SVC` first at `1d21d363`.
`MON3.SVC` is rebuilt for entry on install: `MON3.SVC` gives `MON3>`. The
service records the matrix keys it reads in TEC-OS's KBLAST, as TEC-OS's own
scan does, so a key the page holds during a MON-3 program is let go. At
the CP/M prompt, first build `TAS HELLO3 HELLO3.BIN`; at `MON3>`,
`LOAD HELLO3.BIN` and `GO` write four lines on the LCD,
`MON-3 ON TEC-OS`, `LCD BY RST 10H`, `DIGITS BY RST 20H` and
`KEY BEEPS, AD QUITS`, and count on the digits. On the page, Esc on the
matrix keyboard returns to `MON3>`; on the board, AD on its keypad does too.
`EXIT` returns to `A:SYSTEM>`. `CHAIN.ASM` has left the card; TAS still takes several
statements on a line.

BAZA, `BAZA.RTL` and `BOUNCE.BAS` come from Baza `50dc512`. `BAZA.COM` is
self-extracting, 13,184 bytes on the card, and shows a spinner while it
compiles: a mark, `|`, `/`, `-` or `\`, then a backspace, each time. BAZA
compiles integer statements as 16-bit code and takes BASIC-80's `&H`, `HEX$`,
`MOD`, `\`, `XOR`, `WAIT` and `SWAP`. With it the card's A: has 937,984 bytes
free. `BOUNCE.BAS`, a sprite game on the PICO9918, is steered by tapping W,
A, S and D or by the arrow keys, with Q to quit; it compiles on the card to a
20,736-byte `BOUNCE.COM`. New sessions still start at 40 columns; 80 is a
choice in the width selector, not the default.

Under `CON TTY` or `CON BAT` TEC-OS doesn't scan the matrix, so a matrix key
the page sends was never let go, and the keys behind it waited for good.
`src/keys.mjs` holds such a key for 400,000 cycles, a tenth of a second, on
end, and lets it go, and the next key waits as long again with no key down,
so two keys never go down back to back for a program that reads the matrix
itself. The same bound ends the wait for a key whose release nothing sees: a
MON-3 program's scan records its keys in KBLAST, and once the program ends
nothing scans to clear it. On CRT: and UC1:, and until TEC-OS's startup is
over, keys wait for TEC-OS's scan as before. The page marks startup over at
the first console read that waits for a key (TEC-OS's `CINLP` or `CINMX`)
once STPOS has reached 80h, the ROM's mark that it has taken `STARTUP.CMD`'s
first line: at the first prompt, or in a program that `STARTUP.CMD` starts
and that waits for a key, such as `MON3>`. No such read happens while the ROM
reads `STARTUP.CMD` or a service installs, so on the GLCD board no key is let
go before the shell has run the `GLCD.SVC` line, however late `STARTUP.CMD`
is in A:'s directory. A status poll doesn't count, since the ROM polls before
`GLCD.SVC` is in. The mark is cleared when the CPU reaches COLD, as a reset or
a program's cold boot does, when the page resets the machine, and when a key
is checked with STPOS below 80h. The page checks for the mark after every
step, so that it doesn't depend on when keys arrive. A startup program that
only polls, such as `DEMO` run from `STARTUP.CMD` under `CON TTY`, never marks
startup over, so on `CON TTY` or `CON BAT` a key still waiting for startup is
let go after 40,000,000 cycles, ten seconds; the GLCD board has UC1: as its
console by about 13,500,000 cycles even with A:'s directory full and
`SHELL.SVC`, `GLCD.SVC` and `STARTUP.CMD` written last, a third of that bound. The
hold starts again whenever the key would wait. While a program has EXPAND 1 in the 8000h-BFFFh
window, a matrix key that is down waits: the page reads none of TEC-OS's
bytes for it there, and doesn't hand it to the machine's own key queue, which
would read KBLAST through the bank. A hold already started runs on through
such a spell; the key is down all the while.

The page sends an arrow key typed on the PICO9918's or the GLCD's screen as
the matrix's own arrow key, 03h to 06h for up, down, left and right, which
TEC-OS turns into ESC [ A to D, the route TEC-OS's own starter test feeds
`BOUNCE` by. On the serial pane it sends ESC [ A to D itself.

The build ships the font notices as `FONT-NOTICES.txt` and inline in the
page, checked by `tools/notices.mjs`. Qualification requires two complete passing Viewer suite runs at the final commit.
Of these, `test/build-manifest.test.mjs` covers the VS4 build manifest,
`test/font-notices.test.mjs` the notices, `test/held-key.test.mjs` the matrix
keys: under `CON TTY` `HELLO3` takes the page's Esc and `EXIT` queued behind
it reaches `A>`; at `A>` under `CON TTY` the second of two queued keys goes
down a whole hold after the first is let go; `HELLO3` counts both of a queued
`12`, which MON3.SVC's scan gives with or without that gap, and `1` then Esc
ends it; on CRT: `HELLO3` takes `1` then Esc and `EXIT` reaches `A>`, and keys
typed ahead while `TAS DEMO` builds, and on the GLCD board keys typed while it
starts, also with `STARTUP.CMD` late in A:'s directory, all wait for
TEC-OS's scan; a key isn't let go, or taken as read, on bytes read while
EXPAND 1 is in TEC-OS's window that look like `CON TTY` or like the key in
KBLAST; and under `CON TTY` from `STARTUP.CMD` a screen key is let go, with
the serial keys behind it sent, at `MON3>` started by `STARTUP.CMD` and at
the first prompt, before anything is typed; while `DEMO` from `STARTUP.CMD`
polls under `CON TTY`, a screen key is let go after the startup bound and a
serial space behind it stops `DEMO`; and a cold boot a program enters at COLD
forgets the mark before `STARTUP.CMD` is read again. `test/basic-card.test.mjs` covers
the card's BASIC files and `DEMO.ASM`, a `BAZA TIMES` build and `TIMES` run, a
`BAZA BOUNCE` build and `BOUNCE` run (Graphics I with the ROM's font, its
title and sprites, the ship moved by taps and by the arrow keys as the page's
own key handling sends them through its key queue, and the console back at
`A:SYSTEM>` after Q), a `TAS DEMO` build and `DEMO` run until a key, `DEL`
erasing a file, and a card whose `SHELL.SVC` was taken off booting to the
ROM's bare prompt, where `DEL` is refused and `DIR!TYPE` is one word, `SAVE`'s close
putting its file in the card image by the time the prompt shows, and a
record a program writes into an existing block in the card image while the
program waits at BDOS 1, logged on A: and logged on B:, all in the page's machine. These run the TEC-OS `Machine`
under Node with the page's ROM, card and settings, not a browser.
`test/text-mode.test.mjs` covers how the page decides to copy a file as text
or binary, and that binaries with text types and CP/M programs' data files
round-trip intact. `test/copy-text.test.mjs` copies an LF `.z80` file through
the page with the default setting and opens it in TED, and downloads
`TIMES.BAS` as LF text and `MON3.SVC` byte for byte.
`test/card-mounts.test.mjs` types `CD D:GAMES` in Chromium: the card line
and the Drive list show `D: GAMES` and list its files, and Power cycle gives
the card's own drives again. A second case selects GAMES on A:, presses
Reset, checks the retained A:GAMES and bare prompt, then uses the real
keyboard to list directories, select SYSTEM and reload the shell. It also
checks that the fresh file list has HELLO3.ASM and no HELLO3.BIN.
`test/stored-cards.test.mjs` plants a card saved before the shell, of two
volumes, with `MON3.SVC` as it was at `042474df`, in the page's storage: the page stores
the card `prepareCard` gives with the starter card, byte for byte, with the
starter's `SHELL.SVC` and `MON3.SVC` and the user's files on A: and B: as they
were, shows its note on the serial pane, and `SERVICES` lists the shell. With
A:'s directory full the shell isn't added, the stored card is Node's
prepared one and the note says so, and a power cycle shows it again without
fetching the starter card again; with the starter's recipe refused, the page
says it couldn't fetch the starter card and the next power-on tries again.

VS1 qualified viewer product `5c99400`, with firmware `b706f61`. VS2 qualified
product `d193838`, with firmware `101a98d5`; its completed evidence landed at
`76c4aa0`. The retained `evidence/vs1-*` and `evidence/vs2` directories describe
those particular runs, controls and clean-clone outputs. The subsequent
`f68e3e3` adds the local-server command. Historical results do not establish a
fresh build, browser run or native capability in a new environment.

VS2's greeting line 186 and edited cursor `L186 C27` remain historical results.
The reformatted sample places the greeting on line 193, with the first `H` at
column 18. The zero-based insertion offset is 28 and adding `the ` before
`TEC-OS.` places the edited cursor at `L193 C33`. The worked-example test's assertions use these exact source
coordinates. The exact card-source checks and the TAS/TED edit, build and run
workflow pass for this sample update. Clean bundle and distribution checks
also pass. That sample-only update did not rerun the historical full VS2 suite.
The ROM and all other card-file bytes remain identical.

The page retains saved 32, 40 or 80-column preferences and uses 40 columns
when storage is missing, invalid or unavailable. A failed preference write
leaves the current session choice in use. The
[Compact offer](compact-source-offer.md), with its ROM, font and cold 40-column
default, is received in the current pin.

The historical 50-case Viewer suite passed at
`479a3b90f71b2e6c864c8a26b895addd60b262e1`: all 50 tests passed, with no failures,
cancellations, skips or TODOs. The shared guard recorded 63.4 seconds,
637 MB sampled peak, at most seven processes and zero wait. No native assembly
or firmware rebuild was performed for this page-policy update. Result review,
standalone delivery and public deployment remain separate checks.

Viewer implementation belongs in this repository: page code in `src/`, build
and delivery tools in `tools/`, and their checks in `test/`. Firmware, font and
public host-library implementation belong in TEC-OS. Original study decisions,
sealed source packets and historical results remain traceable in Origo's
`studies/p6-viewer`; changing their location or paths must not silently change
their recorded hashes or turn inactive templates into runnable authority.

The [inactive qualification engineering sources](../tools/qualification/README.md)
now live in this repository. Their [migration map](../tools/qualification/migration-map.json)
binds the exact immutable Origo originals and every source-location edit. The
guard, native caller/owner/C source, diagnostics and declarative controls are
available here for further engineering; they are not enabled commands.

Original source records in Origo include:

- `intake.md`, `stages/compact-source.md` and `models/compact-receiver`: the
  receiving design, named inputs and proposed notice/default mechanisms.
- `models/compact-receiver/guard-prototype`: the original supervision source
  packet, now mapped to `tools/qualification/compact-guard` here.
- `models/native-admission/vd14-successor01`: proposed native membership
  caller, owner, C source and inactive command/bundle templates. These are
  original engineering records, now mapped to `tools/qualification/native-admission`
  here. Historical templates/seals remain separate from the relocated sources.
  Changed source paths and complete command/provider bindings still require
  independent review before use.

Native source review does not supply a supported Mac executor, SDK/provider
closure, native build/run evidence or the remaining A5 admission. Those
prerequisites are not done and no longer gate anything. The partial phosphor model has no accepted product
candidate/default; phosphor is dropped from the programme (P3: KD-258 D3),
and Mac native qualification from the requirements (KD-257). VS4's VE-4 and
VE-5 are implemented: `dist/build.json` certifies the standalone page, and
the starter recipe is pinned by its canonical digest. Source relocation records no new runtime result
and supplies no Mac qualification.
