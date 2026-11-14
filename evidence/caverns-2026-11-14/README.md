# Caverns integration evidence

This is software TEC-1G/emulator and real-browser evidence, not a physical-board
qualification. The public test demo is intended for the author's gameplay review;
that review and a physical TEC-1G run remain to be done.

- `artifacts.json`: exact firmware, compiler, source and executable identities.
- `viewer-tests.tap`: 134 passes, no failures/skips, after fixing drive remount
  sampling. Uses actual Debian Chromium 156.0.8078.79 through the explicit
  TEST_CHROMIUM option. Playwright's browser download was unavailable under
  the cloud network policy; no simulated browser or weakened assertions used.
- `caverns-80-column-tests.log`: seven passes, explicitly selects CON PICO 80.
  Covers full-score quest, every room and the exact TED copy/edit/save/build/run,
  game exit, editor return and reopen-after-power-cycle exercise.
- `baza-tests.log`: compiler stored-evidence/provenance/model checks. The earlier
  native 704-case qualification is described in BAZA's docs/runtime-linking.md;
  this file is not a claim to repeat those 704 native cases.
- `book-build.log`: the existing book/site build and link checks. Historical
  book captures were not relabelled as current Caverns execution evidence.

Viewer tests ran with production code c86225e and TEC-OS 21518f7. The final
TEC-OS pin adds explicit 80-column activation/assertions to tests only; its
ROM and all disk files are identical. The final Viewer commit additionally
records this evidence and updates that test-only gitlink, without changing
application behavior. Hash prechecks and standalone-browser smoke testing
must pass again before publishing the demo.

The BASIC header's extra copyright, origin and recovery REM lines compile to
exactly the previous 39,680-byte COM. They consume source/compiler line-table
space, not emitted statement bytes. Full-comment freedom is not implied.
