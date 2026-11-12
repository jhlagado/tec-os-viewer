# Viewer qualification and source ownership

The viewer's firmware dependency is its `tec-os/` gitlink, currently
`fdd9e5b9a241af2a740d7baac2673f9ddd181bf9`, TEC-OS main, on the release 1
candidate with BASIC and TED's language support, the Compact font, a cold
40-column console and the debugger-support interfaces. TEC-OS builds it
with TAS alone. It follows `d556ec50`, which brought the shell (Origo KD-279
and KD-301), Baza `50dc512`, and the card without `CHAIN.ASM`, by the owner's
decision; `fdd9e5b9` adds A:'s coalesced writes (Origo KD-303) and changes
only the ROM. The card's 15 files and the starter recipe are the same bytes
as at `d556ec50`. It follows `55f01718`, `0e3c1a82`, `402f30ef`, `55114e4d`,
`be654b39`, `31b60837`, `a39416ed`, `7fa28233`, `12b2ec5f`, `9f3931ce`,
`755636b1` and `a1023bd0`, whose font notices it keeps. `pins.json` binds the
ROM, the card's 15 files and the starter recipe's canonical digest.

A volume not written behind, A: among them, now coalesces its data writes: a
data write goes into its block's cache line in EXPAND 1 and returns, and the
one pending block is written to the card at the next flush point: the file's
close, any directory request, a write to another block, a console read
(BDOS 1, 6 input, 10 and 11, and the BIOS's CONIN), a warm boot, function 48,
`MOUNT` and unmount. A failed write keeps the block pending, so the directory
never names it before the card has it. B:, the work disk, is written behind,
as before. TEC-OS's `docs/recovery.md` at the pin has the whole of it.

The page saves the machine's card image, in IndexedDB within two seconds of the
machine writes it and in Download image, and doesn't flush the cache itself:
the cache is the machine's memory, and only TEC-OS can write it to the card.
At a prompt the shell's line read is a flush point, so A: is on the card and
in what the page saves after every command; a block is pending only while a
program writes and hasn't yet closed, read the console or written another
block. Reset, Power cycle, New starter card, Copy file to drive and a width
or display change start the machine again and lose what the cache held, as a
reset does on the board; README says to wait for the prompt, and press `^C`
there for B:.

The ROM's CCP is now minimal: it runs a `.COM` or a `.SVC`, changes drive,
has CP/M's `DIR`, `ERA`, `REN`, `TYPE`, `SAVE` and `USER`, with `CON` and
`UNLOAD`, and reads one line of `A:STARTUP.CMD` after a reset. `SHELL.SVC`, a
resident service on the card, takes the prompt through the ROM's shell hook
and holds the rest: `COPY`, `DEL` and `SERVICES`, the `[more]` pager in `TYPE`
and `DIR`, the history on ^W and ^N, `.CMD` scripts and the rest of
`STARTUP.CMD`, and lines of several commands. `!` always separates and the
next piece runs whatever the last returned; `&` after a blank separates and
the next piece runs only if the last didn't fail. CP/M 3's `:` prefix is gone:
a piece starting `:` is refused as a bad name. The card's `STARTUP.CMD` is
`SHELL.SVC` then `GLCD.SVC`. At power-on the page prepares the card with
TEC-OS's `prepareCard`, which, on a card holding `SHELL.SVC`, keeps that line
first and puts the display's line after it. A service whose
execution record asks to be entered is entered as it installs, so
`MON3.SVC` gives `MON3>`; an old `MON3.SVC /E` still does, with `/E` as its
tail. TEC-OS's `docs/shell.md` at the pin is the shell's full description.

The ROM uses 14,875 of 16,384 bytes, 1,509 free, with the SHA-256
`43ac0f1871cf3d979c94b74a030c1c06eeec500bd77e60ca7e3951a2de1c339e`.
It replaces `327fe7a4…`, `d556ec50`'s, which used 14,769 bytes, and
`95467cae…` before it, which used 15,363. Coalescing's one byte of state,
CPEND, is in the high room above the RAM BIOS table, so with no service
loaded the TPA is still 47,273 bytes; with `SHELL.SVC`, which takes 10 pages, the word at 0006h
is AF00h, a TPA of 44,544 bytes. A `.COM` starts with HL=0100h and DE=0000h.

TEC-OS builds one card: the starter card and the card the page runs are the
same image. Its recipe, `id` `starter` at revision 12, has the canonical
SHA-256
`41b99e57fe25fba84935cfc97b61642ea13245fd0e39e50dcb06acc9dff0b7d9`
(VE-5). The page fetches it from TEC-OS's `dist/starter.recipe.json`; the
separate page recipe is gone. Its 15 files, with the first eight hex digits
of each SHA-256 and their bytes on the card:

| File | SHA-256 | Bytes | From |
| --- | --- | --- | --- |
| `BAZA.COM` | `280ee372…` | 13,184 | Baza `50dc512`, self-extracting |
| `BAZA.RTL` | `14d7fd11…` | 12,032 | Baza `50dc512` |
| `BOUNCE.BAS` | `a8d0d013…` | 5,305 | Baza `50dc512`, as CP/M text |
| `DEMO.ASM` | `5b9adf63…` | 15,335 | TEC-OS, as CP/M text |
| `GLCD.SVC` | `ac040f75…` | 836 | TEC-OS |
| `HELLO3.ASM` | `e8ac3de7…` | 2,170 | TEC-OS, as CP/M text |
| `HELLO3.BIN` | `666ca183…` | 173 | TEC-OS |
| `MON3.SVC` | `a4742967…` | 5,032 | TEC-OS |
| `MOUNT.COM` | `5273f0ba…` | 671 | TEC-OS |
| `SAMPLE.ASM` | `1bfd9696…` | 4,485 | TEC-OS, as CP/M text |
| `SHELL.SVC` | `7e23a61d…` | 2,224 | TEC-OS |
| `STARTUP.CMD` | `76b798ba…` | 22 | TEC-OS |
| `TAS.COM` | `e648a1d0…` | 10,343 | Thorium `3d1e2c0` |
| `TED.COM` | `4f622390…` | 12,334 | Thorium `b69d544` |
| `TIMES.BAS` | `287f0237…` | 626 | TEC-OS, as CP/M text |

`BAZA.RTL`, `DEMO.ASM`, `GLCD.SVC`, `HELLO3.ASM`, `HELLO3.BIN`, `MOUNT.COM`,
`SAMPLE.ASM`, `TAS.COM`, `TED.COM` and `TIMES.BAS` are the same bytes as at
`55f01718`, the pin before `d556ec50`. `SHELL.SVC` is new. `STARTUP.CMD` gains its `SHELL.SVC` line.
`MON3.SVC` is rebuilt for entry on install: `MON3.SVC` gives `MON3>`. The
service records the matrix keys it reads in TEC-OS's KBLAST, as TEC-OS's own
scan does, so a key the page holds during a MON-3 program is let go. At
`MON3>`, `LOAD HELLO3.BIN` and `GO` write four lines on the LCD,
`MON-3 ON TEC-OS`, `LCD BY RST 10H`, `DIGITS BY RST 20H` and
`KEY BEEPS, AD QUITS`, and count on the digits. On the page, Esc on the
matrix keyboard returns to `MON3>`; on the board, AD on its keypad does too.
`EXIT` returns to `A>`. `CHAIN.ASM` has left the card; TAS still takes several
statements on a line.

BAZA, `BAZA.RTL` and `BOUNCE.BAS` come from Baza `50dc512`. `BAZA.COM` is
self-extracting, 13,184 bytes on the card, and shows a spinner while it
compiles: a mark, `|`, `/`, `-` or `\`, then a backspace, each time. BAZA
compiles integer statements as 16-bit code and takes BASIC-80's `&H`, `HEX$`,
`MOD`, `\`, `XOR`, `WAIT` and `SWAP`. With it the card's A: has 933,888 bytes
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
page, checked by `tools/notices.mjs`. All 125 Viewer tests pass on this pin.
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
`A>` after Q), a `TAS DEMO` build and `DEMO` run until a key, `DEL`
erasing a file, and a card without `SHELL.SVC` booting to the ROM's bare
prompt, where `DEL` is refused and `DIR!TYPE` is one word, and a file `SAVE`
writes on A: in the card image by the next prompt, all in the page's machine. These run the TEC-OS `Machine`
under Node with the page's ROM, card and settings, not a browser.
`test/text-mode.test.mjs` covers how the page decides to copy a file as text
or binary, and that binaries with text types and CP/M programs' data files
round-trip intact. `test/copy-text.test.mjs` copies an LF `.z80` file through
the page with the default setting and opens it in TED, and downloads
`TIMES.BAS` as LF text and `MOUNT.COM` byte for byte.

VS1 qualified viewer product `5c99400`, with firmware `78127ec`. VS2 qualified
product `d193838`, with firmware `fe2097f4`; its completed evidence landed at
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

The complete current Viewer suite passed at
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
