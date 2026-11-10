# Viewer qualification and source ownership

The viewer's firmware dependency is its `tec-os/` gitlink, currently
`755636b130241173c5c30a0be8fe6b79cf2fee37`, TEC-OS main: the release 1
candidate with BASIC and TED's language support (Origo KD-262), on the Compact
font, a cold 40-column console and the debugger-support interfaces. It follows
`a1023bd0`, whose ROM and font notices it keeps. `pins.json` binds the ROM, the
page's ten card files and the page recipe's canonical digest. The ROM SHA-256
is still `0f93acdc593299ab2c8a1c6af40ca2db23dd3da22263b58c67a13cb7df86d484`.
The card is the starter card's nine files plus `DEMO.COM`. Four are new or
changed at this pin: `TED.COM` from Thorium `967678c`, with its language table
(`150a19bd…`, 12,154 bytes, replacing `75fd6c64…`), `BAZA.COM` (`725570a6…`,
14,464 bytes) and `BAZA.RTL` (`5854bfb6…`, 11,008 bytes) from Baza `fbfedb6`,
and `TIMES.BAS` (`a9e02e3f…`, 589 bytes). The other six are byte-identical to
`a1023bd0`'s. The page recipe, `id` `page` at revision 6, has the canonical
SHA-256 `b5a4216d7166eed911eb669ffafcfed925118d47329518ddfdf5433b7436f66b`
(VE-5). The build ships the font notices as `FONT-NOTICES.txt` and inline in
the page, checked by `tools/notices.mjs`. All 96 Viewer tests pass on this
pin. Of these, `test/build-manifest.test.mjs` covers the VS4 build manifest,
`test/font-notices.test.mjs` the notices and `test/basic-card.test.mjs` the
card's BASIC files and a `BAZA TIMES` build and `TIMES` run in the page's
machine.

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
