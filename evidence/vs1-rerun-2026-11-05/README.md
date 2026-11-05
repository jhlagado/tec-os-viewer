# VS1 rerun, 5 November 2026

Measured product: viewer `5c9940073f80ad4e90e075bc5e051a9b311ec047`, TEC-OS `78127ec63a2478c544af7fa96bfa73345f9df824`.

Gate authority: Origo `540802d8` (initial registration), `5b34f9b0` (VG8), `1e4b7503` (baseline at this pin), with VD-11 accepting the amended references. Gate readings and pin are unchanged.

Checkpoint: VG2, VG3, VG4, VG5, VG6 and VG8 passed. The full product suite passed 34/34, failed 0, skipped 0. The failing controls run so far failed as required. VG1's two clean builds and its historical-ROM control remain pending. This evidence records measurements for the driver's judgment.

`commands.jsonl` records exact argument vectors, working directories and exit codes. `resources.jsonl` records each guarded run's duration, measured peak and limit; peaks are sampled lower bounds. Individual logs retain assertion output and pass/fail/skipped counts. `gates.py`, `controls.py` and `clean.py` reproduce the runs using temporary paths; controls restore the original bytes in finally blocks. `controls-rest.py` resumed after the recorder expected TAP wording but Node emitted its spec reporter. The VG5 assertion did fail correctly; commands.jsonl records the diagnostic correction.

VG3's eight successful assertions mean seven boot configurations and one successful assertion of the no-card failure (`CARD?`, no prompt). This is not eight successful boot configurations.
