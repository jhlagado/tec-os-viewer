# LCD and bare command receiving candidate

This candidate combines the LCD renderer, prompt history and exact-extension
fixes with the published TAS and Snake9 inputs. Native `2410a75` retains
506 free ROM bytes and the approved eighteen-page shell leaves 41,728 bytes
of TPA on the starter card. Bare names try COM, SVC then CMD, with script
interpretation in the shell. Explicit extensions remain authoritative, and a
ROM or shell built-in keeps precedence over a script of the same name: `TYPE`,
`ERA`, `REN`, `CON` and `UNLOAD` go to the ROM (Native `2410a75`, after the
independent review found they did not). A card saved before the 18-page shell
keeps its own `SHELL.SVC`, which runs a script only by its full `NAME.CMD` (a bare
name goes to the ROM, which tries COM then SVC); back the image up, then choose
New starter card to take the new shell.

A complete Viewer run at `633fc5a` with Native `1518fb7` passed all 231 tests
across 38 files using default Chromium, at a 982 MiB peak. Nine focused Native
checks pass at `5171390` after the reviewed trace and shell-page expectation
updates. Native `d3b07d6` changes those expectations, diagnostics and capacity
documentation. Current `8bfd69a` (a documentation-only merge over the qualified `2410a75`) also preserves the illustrated TEC-OS and
TBG books and the paused-input save guidance from main `0cd9d45`. Its ROM
bytes are those of `31bebd5`; its `SHELL.SVC` is 4,456 bytes, still 18 pages,
with the five ROM built-in names handed to the ROM. These records
support the candidate and do not replace its required final strict pairs.

The earlier component records prove actual bare MON3 entry and Snake9 inverse
menus. The serial strict runner starts a fresh Node process for every file. On
Node versions supporting `--test-isolation=none` it removes the redundant
per-file coordinator. Older Node versions use the existing process mode.
The manifest records the Node version and selected isolation mode. Every
file and test remains required under the same whole-tree memory limit.

The owner approved up to 24,000 additional T-states for shell bare-command
launch, 6 ms at 4 MHz against the measured 5.6825 ms. Bare-ROM launch and
both warm-prompt bounds retain their previous limits. Landing requires two
complete strict passes at the final clean Native and Viewer heads. Earlier
component and historical results retain their own pins and measurements.
Physical-board testing is separate and no firmware release is authorised.

# Prompt history integration (historical)

This section and those after it record earlier pins and figures, kept as they were
measured: the shell then took 17 pages, and `DIR` rows and sizes reflect that card.
The current pins and figures are in the sections above.

The selected native source is TEC-OS `c688458f7404b2f4cae9ab0bed5ebbf870ca86ba`,
incorporating main `4d581d0e`. It preserves the separately qualified card,
Caverns and book integration. This increment changes buffered console input.
At the shell prompt plain Up/Down recalls older/newer commands using the
existing Ctrl-W/Ctrl-N history. Recall replaces partial input, down past the
newest gives an empty line and the recalled command can be edited. Bare CCP
and program line input ignore navigation; raw character input retains it.

The ROM uses 15,787 bytes with 597 free. Its SHA-256 is
`41c87b73e189aa2057c38f31751f5645ac8b61e6b4b3bbd6d3d13fc7bb4423f0`.
The symbol-file SHA-256 is
`1557067177614d60d59e36cd940c198371283479cb0f8ca2d0814bdf896c479c`.
The passive observer retains all admission checks and instruction-span lengths.
Its shifted address operands are bound to the complete matching ROM and map.
The 15 starter files and canonical recipe remain unchanged from the current
main dependency; pins.json names their actual digests.

Page-queue cases cover empty and populated history on serial, PICO and GLCD.
The real Chromium case checks each recall against the active last screen line,
then edits and executes the recalled command. Earlier command echoes cannot
satisfy those active-line checks. The bare-CCP cases verify no shell hook.
The preceding Viewer head `f7ccdc44bbe863338d22a21f2a2088453b166fcd`, with
firmware `6e002a7`, passed all 43 focused navigation, cache and bundle cases,
including real Chromium browser events. Chromium was 156.0.8078.79; the
1,024 MiB guard measured an 820 MiB peak. The run completed on 18 November
2026 at 15:09:16 UTC. This receiving pin preserves those runtime sources
and incorporates later main documentation and its editorial audit tool.
The focused result is supporting evidence; it does not replace full
qualification at this final clean receiving head. Origo's
studies/p3-tec-os/stages/viewer-navigation.md records qualification and landing.
Physical-board tests remain separate and no firmware release is authorised.

The two real transaction/browser cases also passed at Viewer fe726fc with
native5971cb59, using unchanged storage and cost criteria. The sampled peak
was1,003MiB under the same1,024MiB guard. A preceding full Viewer attempt
stopped at the host memory limit and counts as no full pass. These focused
results remain historical supporting evidence after receiving the newer
card. Both full runs must complete at this exact final Viewer head.

Earlier sections retain the pins and results they describe.

# TEC-OS integration 1

The firmware gitlink is `782b0074f11019efe9d1fd0f02e8862421128853`, TEC-OS
integration 1: the sized `DIR`, the nineteen-page MON3 with its Intel HEX
loader, and TAS from Thorium `0c8adea`, which writes Intel HEX. The sections
after this one describe earlier pins and keep their own figures.

The figures here are measured from TEC-OS's build at the pin, through
`npm run tecos`, and from the page's machine running its starter card. The ROM
is unchanged, SHA-256
`c95862634ee002bb9a5ef1d3d0ee8ea831e12fda4e96792b36454170aafabf7f`. Its
symbol file, `tecos.d8.json`, is now
`5c8495e0037a9c878764ddd0db8d6ae8e7e4aa18085a359a92773bcfa470d26d`; it
differs from the previous build's only in naming the TAS commit that made it,
so the guest observer's binding (`src/guest-profile.json`) changes in that
hash alone: the same symbol map, opcode spans and memory profile. The starter
card, `starter.img`, is
`1cdc614e01eacab7c4507310914cbacbbcbdc5b3269ab7bfb995fd9b3a3fc2c1`, and its
recipe `ff7172e502f825f28abd0f5260017baee106aef633f1645e9c945b8ac69afae3`
as a file, with the canonical digest
`7241e02c68a5d4d02cea605fc381fc80f906079bb60e821d110bd5faefaa94e2` that
`pins.json` holds. Three of A:'s fifteen files change; the other twelve are
byte for byte as before:

| File | SHA-256 | Bytes | On the card | From |
| --- | --- | --- | --- | --- |
| `MON3.SVC` | `9cf63c79…` | 5,237 | 5,248 | TEC-OS, 19 pages |
| `SHELL.SVC` | `2697cc8d…` | 4,203 | 4,224 | TEC-OS, 17 pages |
| `TAS.COM` | `8e1f0efb…` | 11,013 | 11,136 | Thorium `0c8adea` |

TED's bytes are those of Thorium `20339b8`'s `TED.COM`, and BAZA's, `BAZA.RTL`'s
and `BOUNCE.BAS`'s those of Baza `74c4382` and `45f2598`, the commits TEC-OS
names for them. On the starter card `BAZA CAVBASIC` writes a 36,736-byte
`CAVBASIC.COM` and `BAZA BOUNCE` an 18,560-byte `BOUNCE.COM`.

`DIR` under the shell gives one row a file, the whole name left in twelve
columns and its size in records times 128 right in eight, then the count and
bytes and the free space, at every width and on the serial console. On the
starter card, at 40 columns:

```
A:SYSTEM>DIR

SHELL.SVC       4224
GLCD.SVC         896
STARTUP.CMD      128
TED.COM        12416
SAMPLE.ASM      4608
TIMES.BAS        640
TAS.COM        11136
BAZA.COM       13184
BAZA.RTL       12928
BOUNCE.BAS      5376
CAVERNS.TXT     2688
DEMO.ASM       15360
MON3.SVC        5248
HELLO3.ASM      2176
CAVBASIC.BAS   18816
15 files, 109824 bytes
909312 free on A:SYSTEM
```

On the GLCD's eight rows it stops at `[more]` after `TIMES.BAS`. `DIR /W` is
the ROM's wide listing. The TPA on the starter card, by what is installed:

| Installed | Word at `0006h` | TPA |
| --- | --- | --- |
| nothing | `B6C5h` | 46,533 |
| `SHELL.SVC` | `A500h` | 41,984 |
| `SHELL.SVC`, `GLCD.SVC` | `A200h` | 41,216 |
| `SHELL.SVC`, `MON3.SVC` | `9200h` | 37,120 |
| `MON3.SVC` | `A300h` | 41,472 |
| `GLCD.SVC`, `MON3.SVC` | `A000h` | 40,704 |
| `SHELL.SVC`, `GLCD.SVC`, `MON3.SVC` | `8F00h` | 36,352 |

TED's text holds 28,182 bytes with the shell, on serial and on the PICO9918
at 40 columns, 23,318 with `MON3.SVC` installed and left by `EXIT`, and 22,550
with `GLCD.SVC` as well, on the GLCD board. `TAS HELLO3 HELLO3.HEX` writes
`HELLO3.HEX`, 512 bytes on the card, and at `MON3>` `LOAD HELLO3.HEX` and a
bare `GO` run HELLO3 at 4000h, its lowest address, as `LOAD HELLO3.BIN` and
`GO` do.

The guest observer's shell fixtures, `test/fixtures/guest-shell.symbols.json`
and `test/fixtures/guest-shell-profile.json`, are taken again from an assembly
of the pinned `drivers/shell.asm` at 100h with the pinned TAS: the line buffer
is now at 3830 bytes into the shell and its stack top at 4096. The same method
at the previous pin gives the previous symbol fixture byte for byte.

A card saved before the shell, of two volumes, is still brought up to date at
power-on: it gets the starter's 17-page `SHELL.SVC` and 19-page `MON3.SVC`,
with the note on the serial pane, and its TPA is then 42,752 bytes with the
shell (`A800h`) and 37,888 with `MON3.SVC` too. A card saved from the previous
starter keeps its own `SHELL.SVC`, `MON3.SVC` and `TAS.COM`, and the earlier
`DIR` rows, with 42,496 bytes of TPA under its shell; New starter card gives
this pin's files.

The tests that read `DIR`'s rows now look for the sized rows the starter card
gives: `HELLO3.ASM` at 2176 and `SHELL.SVC` at 4224. The compact-print
evidence's browser result and test log were byte for byte TEC-OS's own
`docs/evidence/caverns-print-helpers/viewer-result.json` and
`docs/evidence/caverns-print-helpers/viewer-tests.log`, which the no-copy check
refuses, so they are now read in `tec-os/` at the pin;
`docs/evidence/print-helpers/qualification.json` stays here. The two complete
`npm test` runs at this source, their summaries and the browser they used are
recorded in Origo's `studies/p3-tec-os/stages/viewer-int1-landing.md`.

# Persistence and recovery feedback

This source separates the guest block cache, the current card image and completed
browser storage. The firmware pin remains `241b4381007a6b1e7f179c4f8358c65d564e06ae`;
its ROM, card-file and recipe identities stay in `pins.json`. Native cycle/state
and physical-memory purity evidence is separate from browser storage completion.
The observer admits only the exact bound firmware/memory/checkpoint model and
otherwise reports unavailable or last-check information.

Focused coverage includes owned snapshot/token ordering, actual IndexedDB
completion/failure/retry, protected unread records, lifecycle races, native
guest errors and real reporter callbacks. Actual-page cases distinguish a prior
stored card from pending RAM and hold a native transaction after put success:
Saving remains visible until native completion, while the paused guest retains
its pending data. Full downloaded-card/IDB hashes and independent CP/M byte
predictions check the physical image. No automatic guest flush or overall
“All saved” indication is introduced.

The [cost criteria](../test/fixtures/viewer-feedback-cost.json) are additive
checks for the stock13MiB card on PICO40: four fresh public rate notifications
of at least3.9MHz, an observed interval overlapping the unheld native save,
three individual pause/run/pause clicks within100ms each, eight representative
owned card copies within50ms each, and at most16KiB additional normalized
module bytes against the named published baseline. These finite host checks
include automation overhead and allocation pressure; they do not establish
universal CPU percentages, instantaneous peak memory or physical-board timing.
The copy measurements are representative stored-byte copies, not intercepted
coordinator snapshots. Memory retains the single in-flight snapshot/coalesced
intent contract; no general RSS or heap allowance is changed.

The complete ordinary `npm test` command remains required twice at the same
clean final source, with unchanged bound inputs, all authored cases passing
and no filters/skips. The standalone build must match that source and firmware
before publication. Exact run counts, component pins, payload hashes and
publication results are retained in Origo and in the public demo's
[build details](https://jhlagado.github.io/tec-os-viewer/build-info.json).
Earlier semantic/cost observations are not retroactively treated as registered
gate passes. This is emulator/browser qualification; physical-board testing
and an application's unclosed work remain outside its durability claims.

# Housekeeping recipient integration

The firmware gitlink is `241b4381007a6b1e7f179c4f8358c65d564e06ae`, with
ROM SHA-256 `c95862634ee002bb9a5ef1d3d0ee8ea831e12fda4e96792b36454170aafabf7f`.
It preserves the Caverns integration and all sixteen starter file payloads.
The starter recipe's canonical digest is
`cfad4c0e6e788d1b9713d3e34647799d0a8e22a17aca09b4a6a13cbed1e009c7`;
`pins.json` holds the exact ROM, recipe and file identities.

The core's standard full strict qualification passed 1,383/1,383 twice at
that exact firmware source. The Viewer recipient source
`4ee6e169ad51ed3517decc5a0140d2097ec894d6` also passed two complete,
unfiltered runs of 134/134 tests, with no failures, cancellations or skips,
and unchanged bound inputs. They include standalone-page boot without external
asset requests, commit labels, ROM CD recovery, saved-card upgrades, Caverns
preservation and the TED edit/build/run exercise. The browser tests used
system Chromium 156.0.8078.79 explicitly; this does not qualify Playwright's
separately distributed browser or a physical TEC-1G.

An earlier complete 133/134 run failed the unchanged bundle source-path check
because a shared dependency link resolved outside the recipient worktree.
It remains a failed run. The successful pair uses an owned, byte-identical
dependency copy and records resolved paths as well as content hashes. Origo
retains the failed attempt, both passing runs, runtime inputs and independent
reviews. The public demo's
[build details](https://jhlagado.github.io/tec-os-viewer/build-info.json)
identify its actual published Viewer commit and firmware pin; source and
qualification records alone do not update that page.

OS API boundaries now prioritise dirty work; required input drains pending
writes, and failed acknowledged data writes are retained and reported; rejected
directory updates are not published. Bootstrap recovery waits
for an explicit Enter retry when disk state cannot be rebuilt. README describes
the remaining cooperative, restart and browser-saving limits. This recipient
uses the original eighteen-page MON3 and TAS `3d1e2c0`; the separately qualified
MON3 load-address/TAS HEX development branches are not adopted here.

# Historical Caverns integration

At this historical checkpoint the TEC-OS gitlink was `5aacb5e`, with ROM SHA-256
`ac86ad233696d22a46b4f98a4119c53b718bfe89881952a08e9f92223f3fa1c3`.
Starter revision 16 contains sixteen files. The new files are the author-refined
original BASIC game's CAVBASIC.BAS, CAVBASIC.COM and CAVERNS.TXT. BAZA compiler
and runtime are pinned at `8578fe5`; executable size is 39,680 bytes. All exact
ROM, recipe and file identities are in
[`pins.json` at the original Viewer checkpoint](https://github.com/jhlagado/tec-os-viewer/blob/0b36cbeaa501389e5c01fd7ad518019c60809aea/pins.json).

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


**Packed font and RST 7 pin.** TEC-OS `249ab23` packs the ROM font (384
bytes plus an eight-byte table of the four glyphs that light a fifth
column), serves glyphs through service 17, `TNGLYPH`, retires service 15 at
ABI 5.2, and lets a service claim RST 7 only, RST 1 to 6 being swept at every
warm boot. ROM `2a895d6f…`, 15,549 bytes used, 835 free. `GLCD.SVC`
`ec8ee1d6…` (836 bytes, three pages), `MON3.SVC` `6fe01737…` (5,215 bytes,
main's table-driven page-zero save), and the card's `BOUNCE.BAS` `9d909274…`
(5,370 bytes: Baza `5f6b58d`'s lines 40, 50 and 170 taken through service 17).
`SHELL.SVC` is unchanged. The guest observer's ROM spans and the shell symbol
map (`TNGLYPH` 17, `TNCOUNT` 18) are restated to this build. The BOUNCE
check compares video memory with the font's glyphs as service 17 gives them.
Two complete Viewer strict runs at Viewer `09eedd8` and TEC-OS `e60fd77` pass
231 of 231 (peaks 907 and 904 MB). Two earlier runs at the same heads failed
one representative card copy each (57 and 62 ms against 50 ms); the old pin
showed the same host noise in isolated reruns, and those receipts are kept.
TEC-OS `249ab23` adds only main's TBG book pages over `e60fd77`.

**COM launch vector and stream-free TAS pin.** TEC-OS `8d6c09b` adds
`COMVEC` at BF62h, ABI 5.3 (ABIMIN 3): a word the CCP calls after loading a
COM file that runs at 0100h, cleared when its page is freed. TAS and TED
come from Thorium `cf5460c`, whose `.TBG` drops the statement stream; BAZA
and `BAZA.RTL` come from Baza `c49f477`, which claims RST 7 only. ROM
`d10a13a2…`, 15,600 bytes used, 784 free; TPA 47,238 bytes, starter 46,534.
`SHELL.SVC` is unchanged. The guest observer's ROM spans are restated to
this build: eleven of the fourteen move with the two-byte workspace word.
Two complete Viewer strict runs at Viewer `23d1492` and TEC-OS `8d6c09b` pass
231 of 231 across 38 files (peaks 857 and 846 MB). The TBG browser tests,
which need a TBG package, sit in `test/tbg/` outside the strict suite.

**Five-volume starter card.** TEC-OS `e03144e` puts five themed volumes on
A: (SYSTEM, ASM, BASIC, MON3 and GAMES, each with the core set of
`STARTUP.CMD`, `SHELL.SVC`, `GLCD.SVC`, `TED.COM` and TBG's `TBG.SVC`,
`TBGSYM.SVC` and `TBG.HLP` from tbg `fb97b61`), WORK on B: and a spare C:;
the card is 14,680,064 bytes and the starter TPA 46,790 bytes, 41,984 with
the shell. GAMES carries `CAVERNS.COM` (37,888 bytes) and `BOUNCE.COM`
(16,000 bytes), compiled by the pinned BAZA when the card is built. The ROM
is unchanged (`d10a13a2…`). Tests that need a volume's files build the
page's card with that volume on A: (`recipeOn`). Two complete Viewer strict
runs at Viewer `debe336` and TEC-OS `e03144e` pass 231 of 231 across 38
files (peaks 877 and 917 MB).

**F1-F10, TED.\* and TAS from TAS.** TEC-OS `3f5ed4a` sends F1-F10 for
Fn with a digit key (Fn+1-4 as ESC O P-S, Fn+5-0 as ESC [ nn ~), the tail
read from ROM through `KBTP`. TED comes from Thorium `dc0cd0f` and keeps its
session in `TED.SES`, `TED.ERR` and `TED.PRJ`; TAS comes from TAS `fdd21f5`,
as does the host runner; BAZA comes from Baza `4204b18` with its runtime
from `c49f477`; `TBG.SVC` and `TBG.HLP` come from tbg `aacc59e`. The ROM is
`06e8c0f1…`, 15,675 bytes used. The guest observer's ROM spans are restated:
thirteen move with the ROM and keep their instructions. Two complete Viewer
strict runs at Viewer `460d359` and TEC-OS `3f5ed4a` pass 231 of 231 across
38 files (peaks 866 and 866 MB), and the two TBG browser tests pass.

**TBUG.** TEC-OS `7a5d932` carries TBUG from tbug `58e4054`, the debugger
renamed from TBG with its symbols built in: `TBUG.SVC` (9,184 bytes, 32 pages)
and `TBUG.HLP` take the place of `TBG.SVC`, `TBGSYM.SVC` and `TBG.HLP`, so
every A: volume holds two debugger files. `UNLOAD` leaves `(0006h)` at B7C6h
and `TBUG.SVC` lowers it to 9700h, 38,400 bytes for a program. `TBUG.SVC NAME`
arms and chains the program by function 47. TED's pin names jhlagado/ted. The
ROM is unchanged (`06e8c0f1…`), so the guest observer's profile stands. Two
complete Viewer strict runs at Viewer `a89a4f2` and TEC-OS `7a5d932` pass 231
of 231 across 38 files (peaks 874 and 834 MB), and the two TBUG browser
tests pass.

**TED 70ff3df and BAZ.** TEC-OS `787068f` carries TED from TED `70ff3df`
(12,584 bytes), which builds with F9 and runs with F5, Fn+9 and Fn+5 on the
matrix, and has retired `^T`; a `.BAS` runs under `BAZ.COM` from Baza
`11af8c3` (18,048 bytes), the interpreter preview, now on SYSTEM and BASIC.
The worked example builds and runs SAMPLE with F9 and F5. The ROM is
unchanged (`06e8c0f1…`), so the guest observer's profile stands. Two complete
Viewer strict runs at Viewer `6451793` and TEC-OS `787068f` pass 231 of 231
across 38 files (peaks 880 and 862 MB), and the two TBUG browser tests pass.

**The 11-page shell and BAZ 8655d81.** TEC-OS `093b07f` carries the 11-page
`SHELL.SVC` (4,100 bytes, 4,224 on the card), with DIR, COPY and SERVICES an
overlay read from the shell's own file, ABI 5.4 with TNPARSE, and a TPA of
43,776 bytes with (0006h) at AC00h. `BAZ.COM` comes from Baza `8655d81`
(20,864 bytes, `b4bceb5b…`). The ROM is `d21e1f6c…`. The guest observer's
profile is restated to that ROM, with spans moved by address and SVCDSP grown
by its TNPARSE dispatch, and the guest probes are bound to the new shell's
symbol map. Two complete Viewer strict runs at Viewer `c1ce20b` and TEC-OS
`093b07f` pass 231 of 231 across 38 files (peaks 930 and 922 MB).

**TEDP.** TEC-OS `b539be3` adds `TEDP.COM` from TED `fc2e652` (14,919 bytes,
`509560a0…`) to SYSTEM beside `TED.COM`, which is unchanged: TED with the
document kept on the card, for files up to 65,535 bytes. The ROM is
unchanged (`d21e1f6c…`), so the guest observer's profile and the shell
binding stand. Two complete Viewer strict runs at Viewer `976acd6` and TEC-OS
`b539be3` pass 231 of 231 across 38 files (peaks 923 and 866 MB).

**The page keys.** TEC-OS `658933d` gives the matrix Page Up, Page Down,
Home and End on Fn with an arrow and xterm's Shift arrows, from one table of
the tails after ESC (ROM `bf2bcef5…`, 15,712 bytes used, 672 free). It takes
TED `9cbb955` (`94e3ba36…`, 14,919 bytes), TED with its document on the
card, drops `TEDP.COM` from SYSTEM, and takes Baza `be3370c` for BAZA, its
runtime and BAZ, with CAVERNS and BOUNCE rebuilt. The Viewer sends the page
keys and Shift arrows as those matrix chords, and Option with a letter as Ctrl
with it. The guest observer's thirteen moved spans are restated: their call
targets and table addresses move 30 bytes, and their instructions do not;
the shell binding stands. Two complete Viewer strict runs at Viewer `05d4e80`
and TEC-OS `658933d` pass 235 of 235 across 39 files (peaks 870 and 923 MB).

**The CCP's pager, history and prompt.** TEC-OS `2e54731` moves the pager,
a 96-byte line history, `CLS` and the volume label into the CCP (ABI 5.6,
`TNPAGE` and `TNPRMPT`), so the bare prompt reads `A:SYSTEM>` as the
shell's does, and Shift with Tab on the matrix is back-tab, `ESC [ Z`
(ROM `bb429d10…`, 16,144 bytes used, 240 free). `SHELL.SVC` is 9 pages
(3,462 bytes, `e8f707b4…`). It takes TED `dbcffc1` (`35084567…`, 16,199
bytes) and Baza `184db08` for BAZA (`bd937973…`), its runtime
(`27196de6…`) and BAZ, with CAVERNS (`7ad164db…`, 38,400 bytes) and BOUNCE
rebuilt. The Viewer sends Shift with Tab as back-tab by serial too, and as
Shift with key 9 on the matrix. The guest observer's fourteen spans are
restated at the new ROM; every hook point it acts on is the same
instruction, and COLD's second span now holds the history ring's start.
The guest probes are bound to the 9-page shell's symbol map. Two complete
Viewer strict runs at Viewer `57a4d36` and TEC-OS `2e54731` pass 236 of 236
across 39 files (peaks 871 and 874 MB).

**BAZC and TAS on every volume.** TEC-OS `36bb11e` renames the BASIC
compiler BAZC, from Baza `3f31488`: `BAZC.COM` (`05e81d71…`, 13,824 bytes),
its runtime `BAZC.RTL` (`27196de6…`, the same bytes as BAZA's) and BAZ, the
interpreter (`4e2631d2…`, unchanged). CAVERNS (`7ad164db…`) and BOUNCE
(`edecad40…`) compile to the same bytes as before. `TAS.COM` joins the core
set, so every A: volume carries it, and TED is `b2f98bc` (`2f5bfb21…`,
16,199 bytes). The ROM (`bb429d10…`) and `SHELL.SVC` (`e8f707b4…`) are
unchanged, so the guest observer's spans and the shell binding stand. The
card-mounts test now waits, after a reset, for the startup's `GLCD.SVC`
line and the bare prompt before it types: the CCP prints a bare prompt
before each startup line's echo, and a key typed then is lost to the warm
boot that ends the service's load. Two complete Viewer strict runs at
Viewer `da037c7` and TEC-OS `36bb11e` pass 236 of 236 across 39 files
(peaks 878 and 917 MB).

**BOUNCE titled BAZ BASIC.** TEC-OS `a376a76` takes `BOUNCE.BAS` from Baza
`7beac04`, whose title and opening `REM` name BAZ BASIC, the language,
rather than BAZA (`b886676a…`, 5,187 bytes). The card's adapted copy is
`4d0bbdd8…` (5,368 bytes) and its `BOUNCE.COM` `bd9e1b38…`, still 16,640
bytes; the title is drawn at 1802h as before. Nothing else on the card
changes. Two complete Viewer strict runs at Viewer `6baa947` and TEC-OS
`a376a76` pass 236 of 236 across 39 files (peaks 892 and 867 MB).

**One keyboard.** Viewer `dc84aa3` gives the page one matrix keyboard, as
the TEC-1G has one matrix: every key typed on the page is a matrix key,
whichever display was clicked, and only the serial pane, the phone keyboard
and the page's controls keep their own. A held key stays down until its
keyup; once let go it stays down until TEC-OS's scan takes it, or a
twentieth of a second after another reader such as TBUG has read it, so
type-ahead waits for the scan and a key no longer stays down while TBUG
holds a program stopped. The firmware pin, TEC-OS `a376a76`, and the card
are unchanged. The normalized module is 154,959 bytes, 67 under the
155,026-byte bound. Two complete Viewer strict runs at `dc84aa3` pass 236 of
236 across 39 files (peaks 881 and 889 MB), and `test/tbg` passes 4 of 4
there (peak 840 MB).

**TBUG a4d1da8.** TEC-OS `b5af505` takes `TBUG.SVC` (9,131 bytes,
`ec86668b…`) and `TBUG.HLP` (3,584 bytes, `e3c26962…`) from TBUG `a4d1da8`:
the matrix no longer repeats in TBUG, the first stop opens in Code, and the
views run Code, Registers, Symbols, Stack and Memory. The ROM (`bb429d10…`),
`SHELL.SVC` and the card's file list are unchanged; the recipe digest becomes
`f1e735c1…`. Code now keeps its window while PC stays in it, so `test/tbg`
puts PC on Code's top row with `G 103` before it looks for `TAKE:`'s label row
(Viewer `3e9fa80`). Two complete Viewer strict runs at `82468a5` pass 236 of
236 across 39 files (peaks 949 and 997 MB), and `test/tbg` passes 4 of 4 at
`2f12d22`, which merges `3e9fa80` (peak 841 MB).

**Browser tests in less memory.** The strict runs at `8d7e623` peaked at
1,006 and 1,000 MB against the 1,024 MB guard, and every file over 260 MB was a
browser test, from 698 MB (`web-touch`) to 947 MB (`guest-save-cost-browser`),
each measured alone. The guard adds up every process in the tree, and Chromium
ran one page in seven: 524 MB. From `a90c139`, `test/lib/root.mjs` launches it
in three, with no zygotes and the GPU and network services in the browser
process, 346 MB for the same page; the page renders and fetches as before.
`guest-save-cost-browser` falls to 732 MB and `copy-text` from 907 to 720 MB.
The guard's limit is unchanged. Two complete Viewer strict runs at `a90c139`
pass 236 of 236 across 39 files (peaks 747 and 798 MB), and `test/tbg` passes
4 of 4 after each (peaks 607 and 661 MB, from 835 and 868).

**Ctrl with a letter.** Ctrl with a letter reached the matrix as its control
code, which the runtime's table types as the key with that number, and keys 1
to 7 are the TEC-1G's Ctrl, Fn, the four arrows and Caps Lock: Ctrl+C pressed
Up, so `^C` neither broke nor copied in TED, Ctrl+D to Ctrl+F pressed the other
arrows, Ctrl+G toggled Caps Lock, and Ctrl+A and Ctrl+B did nothing. From
Viewer `be87a10`, `keyInput` gives Ctrl, Option or the phone keyboard's Ctrl
with a letter as that letter's key, 35 plus its code, held with Ctrl.
`test/ctrl-letters` checks all 26 letters against the runtime's table and
runs TEC-OS's `KEYS.COM` on the page's machine, where Ctrl+A, C, D, F and G
and z read as `01 03 04 06 07 7A`; on the old `keys.mjs` it fails. The
normalized module is 155,011 bytes, 15 under the 155,026-byte bound, as
`keyInput`'s held-key results share one helper. Two complete Viewer strict
runs at `6d2cb08` pass 238 of 238 across 40 files (peaks 733 and 759 MB), and
`test/tbg` passes 4 of 4 after each (peaks 608 and 617 MB).

**TEC-OS a738e2d.** TEC-OS `a738e2d` moves the books to jhlagado/tec-os-books,
gives `tools/capture.mjs` `@fn` and `@arrow`, and has its host model type
01h, 02h and 07h on the matrix as Ctrl with A, B and G rather than the Ctrl,
Fn and Caps Lock keys; 03h to 06h stay the arrow keys. The ROM, the card, the
recipe and every pinned file are those of `b5af505`, so only the gitlink
moves. The page already sends Ctrl with a letter as the letter's key. The
host model's change adds 76 bytes to the page's module, 61 over the bound;
Display, Columns and Power now share one `notRestarted` for their restart
message (Viewer `e07587b`), which saves 149, leaving the module at 154,938
bytes, 88 under. `test/tbg` read the book's `STEP.ASM` from
`tec-os/documentation`, which a738e2d no longer has; it now keeps the book's
listing as `test/tbg/step.asm`, from tec-os-books `1896e6e` (Viewer
`8c82ea5`), identical to the copy in TEC-OS `b5af505`. Two complete Viewer
strict runs at `e07587b` pass 238 of 238 across 40 files (peaks 800 and
767 MB), and `test/tbg` passes 4 of 4 at `7410c5e`, which merges `8c82ea5`
(peak 686 MB).

**TBUG f31249a.** TEC-OS `0160b48` takes `TBUG.SVC` from TBUG `f31249a`
(9,139 bytes, `997363d9…`), where Left in Code puts PC on the top row;
`TBUG.HLP` stays at `a4d1da8`. The ROM, the shell and every other card file
are unchanged, and the recipe digest becomes `6e232cbd…`. The module is still
154,938 bytes. Two complete Viewer strict runs at `c25f0d0` pass 238 of 238
across 40 files (peaks 812 and 798 MB), and `test/tbg` passes 4 of 4 after
each (peaks 647 and 647 MB).

**No size ceiling.** John lifted the module size ceiling on 28 November 2026.
`test/web-bundle` keeps its checks that the bundle uses no Node globals and
one runtime, from `tec-os/`, and now reports the module's size, 154,938 bytes,
without failing on it. `test/fixtures/viewer-feedback-cost.json` drops the
baseline module bytes, the allowance and the 155,026-byte decision, and keeps
its speed, control and copy criteria.

**TEC-OS 8a7e24e.** TEC-OS `8a7e24e` reads a bare or `.SVC` service name from
A: as a COM is read, so `tbug step` at B:WORK> finds A:TBUG.SVC, and takes
`TBUG.SVC` from TBUG `167f7f0` (9,085 bytes, `24d7ceb9…`): no ARM, `tbug
NAME`, lowercase commands. The ROM changes, to `1225ea0d…`; every guest-observer
span keeps its bytes at the same address and the symbol map is unchanged, so
`src/guest-profile.json` restates only its ROM and d8 hashes. The recipe digest
becomes `61cf83c2…`. Of four complete strict runs at `b8f4b4e`, the first
stopped at `guest-save-cost-browser`: three of its eight card copies took 73 to
79 ms against the 50 ms bound, where every other run's copies took 8 to 15 ms,
on a change that doesn't touch the copy path. The other three pass 238 of 238
across 40 files (peaks 793, 764 and 706 MB), and `test/tbg` passes 4 of 4 after
all four.

## Restored Caverns prose and current firmware

The source-only starter now supplies CAVERNS.BAS, compiling to a 37,248-byte
CAVERNS.COM with Baza eee4ee6. The game's preferred display is 80 columns.
Original MicroWorld prose is restored while modern directions and puzzles
remain. The displayed copyright is 1982-83; the GPL notice retains 2019.

The final full Viewer run passes 202 checks, zero failures/skips, with the
same feedback/copy criteria. A shared-host copy-time failure is retained;
isolated CPU time passes the unchanged limit. Passive ROM bindings and shell
fixtures were regenerated from current firmware, without changing observer
logic. The removed OS SAVE fixture is replaced by a native 32-record
make/write/close test that verifies all 4096 output bytes.

The public standalone is built from Viewer d909250 and qualified TEC-OS
1dd75f5b, and its exact tested bytes are pushed to gh-pages at 0a02a27.
Fresh Chromium compiles the exact executable, plays the opening and restores
an exported checkpoint in independent storage. The cloud HTTP proxy refuses
the live site, so the uploaded files are verified through Git rather than
claimed as observed over public HTTP. Physical testing and final author review
remain separate. [Current receipts](evidence/caverns-prose-restoration/qualification.json)
include all full-suite and browser results, known failed attempts and exact
publication identities.

The shared browser screenshots/result are now
[linked to their byte-identical pinned TEC-OS records](evidence/caverns-prose-restoration/shared-native-evidence.md)
instead of duplicated here. The prose-concision receiving run exposed these
copies through the existing no-copy gate. No gate or evidence bytes were
weakened or lost by consolidating the canonical records.

## Caverns prose recovery and concision receiving checks

The current receiving candidate supplies the restored and lightly edited
CAVERNS.BAS. Its native COM is now 35,968 bytes after the literal-only crypt correction. Full Viewer qualification passes
202 tests with zero failures/skips and unchanged speed/control/copy bounds.
Runtime and observer code are unchanged. The prior evidence-duplication issue
is fixed by canonical links, not by weakening the no-copy test. The installed
Chromium is selected through the existing TEST_CHROMIUM option.

[Receiving receipts](evidence/caverns-prose-concision/receiving.json) retain the
failed environment/single-CPU attempts and the passing full log. Firmware main
integration is pending the two strict native platform runs. The browser scene
captures remain canonical in TEC-OS to comply with the no-copy boundary.


## Final Caverns prose recovery and light editing

Viewer source 2242bb7b pins TEC-OS f4b0423b and final CAVERNS.COM d5637368
(35,968 bytes). The source-only starter is refreshed. All 202 receiving checks
pass with no failures or skips using system Chromium on two CPUs, matching
the container quota. Timing criteria, runtime and observer code are unchanged.
Two prior unbound-host timing failures are retained alongside the successful
full run in docs/evidence/caverns-prose-concision/final-receiving.json.
Native validation scopes and final browser proof remain canonical in TEC-OS.
Physical testing and the author's final read-through remain outstanding.


The tested main standalone is built from Viewer 9ca6aa09 and native f4b0423b.
Its 418,779 bytes (SHA-256 c61a1ec1…) compile the exact final COM and restore
an exported checkpoint in fresh browser storage. These exact HTML bytes are
pushed to gh-pages 3b8dce07; both the remote commit and file hash are verified.
The environment CONNECT proxy blocks a live HTTP probe with 403. Publication
does not imply a physical-board test or final author prose approval.
See docs/evidence/caverns-prose-concision/publication.json. The owned active
development branch and publishing worktree are now removed.
