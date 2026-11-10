# Viewer qualification and source ownership

The viewer's firmware dependency is its `tec-os/` gitlink, currently
`31b60837d24cf801b5e8cf4daa4856f520227795`, TEC-OS main: the release 1
candidate with BASIC and TED's language support (Origo KD-262), on the
Compact font, a cold 40-column console and the debugger-support interfaces.
It follows `a39416ed`, `7fa28233`, `12b2ec5f`, `9f3931ce`, `755636b1` and
`a1023bd0`, whose font notices it keeps. `pins.json` binds the ROM, the
page's eleven card files and the page recipe's canonical digest. The ROM,
with 16,247 of 16,384 bytes used, a `DEL` command beside `ERA` and
`NAME.SVC /E`, which enters an installed service, has the SHA-256
`3e5311d2b9706ca3e64bf2c3e0198b883b6394dde8d62316fd8fdeb881192fd9`.
It replaces `3ed68c47…`, the ROM of `a39416ed`, which used 16,077 bytes.
A `.COM` now starts with HL=0100h and DE=0000h. TEC-OS also builds
`MON3.SVC`, a MON-3 compatibility service, which is on no card. The card
is the starter card's nine files plus `DEMO.ASM`, the hardware demo's
source (`5b9adf63…`, 15,335 bytes as CP/M text), and `BOUNCE.BAS`. It no
longer holds `DEMO.COM`: `TAS DEMO` builds it and `DEMO` runs it. From
Thorium `b69d544` comes `TED.COM` (`4f622390…`, 12,334 bytes), which takes
trailing 00h as a file's end and gives a line and column with error 03.
From Baza `747b9a7` come `BAZA.COM` (`27724068…`, 16,128 bytes), `BAZA.RTL`
(`7c0cda03…`, 11,136 bytes) and `examples/BOUNCE.BAS` (`fab92802…`, 4,177
bytes of LF text, unchanged since `a9e7b2f`). This BAZA compiles faster
and makes faster programs, with no language change: `BAZA TIMES` now
writes a `TIMES.COM` of 9,088 bytes (`347b974d…`). The page's card alone
holds `BOUNCE.BAS`, as CP/M text (`07196e57…`, 4,266 bytes): a sprite game
on the PICO9918, steered by tapping W, A, S and D, with Q to quit.
`TIMES.BAS` is `b3aa2578…`, 626 bytes. `GLCD.SVC`, `MOUNT.COM`,
`SAMPLE.ASM`, `STARTUP.CMD` and `TAS.COM` are byte-identical to
`a1023bd0`'s. The page recipe, `id` `page` at revision 9, has the
canonical SHA-256
`97f80e7b0eae4269bf89ad16e35fe698b062f07aff4b4c877cb53f63f934139c`
(VE-5). The build ships the font notices as `FONT-NOTICES.txt` and inline in
the page, checked by `tools/notices.mjs`. All 109 Viewer tests pass on this
pin. Of these, `test/build-manifest.test.mjs` covers the VS4 build manifest,
`test/font-notices.test.mjs` the notices and `test/basic-card.test.mjs` the
card's BASIC files and `DEMO.ASM`, a `BAZA TIMES` build and `TIMES` run, a
`BAZA BOUNCE` build and `BOUNCE` run (Graphics I with the ROM's font, its
title and sprites, the ship moved by taps and the console back at `A>` after
Q), a `TAS DEMO` build and `DEMO` run until a key, and `DEL` erasing a file,
all in the page's machine. These run the TEC-OS `Machine` under Node with the
page's ROM, card and settings, not a browser. `test/text-mode.test.mjs` covers
how the page decides to copy a file as text or binary, and that binaries with
text types and CP/M programs' data files round-trip intact.
`test/copy-text.test.mjs` copies an LF `.z80` file through the page with the
default setting and opens it in TED, and downloads `TIMES.BAS` as LF text and
`MOUNT.COM` byte for byte.

VS1 qualified viewer product `5c99400`, with firmware `78127ec`. VS2 qualified
product `d193838`, with firmware `fe2097f4`; its completed evidence landed at
`76c4aa0`. The retained `evidence/vs1-*` and `evidence/vs2` directories describe
those particular runs, controls and clean-clone outputs. The subsequent
`f68e3e3` adds the local-server command. Historical results do not establish a
fresh build, browser run or native capability in a new environment.

VS2's greeting line 186 and edited cursor `L186 C27` remain historical results.
The reformatted sample places the greeting on line 193, with the first `H` at
column 18. The zero-based insertion offset is 28 and adding `the ` before
`TEC-OS.` places the edited cursor at `L193 C33`. The VG10 assertions use these exact source
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
