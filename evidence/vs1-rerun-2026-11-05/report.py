import pathlib,json,re,shutil,hashlib
src=pathlib.Path('/tmp/p6-vs1-rerun');dst=pathlib.Path('/Users/johnhardy/projects/tec-os-viewer/evidence/vs1-rerun-2026-11-05')
for p in src.iterdir():
 if p.is_file() and (p.suffix in ['.log','.json','.jsonl','.py','.mjs','.sha256']):shutil.copy2(p,dst/p.name)
rows=[json.loads(l) for l in (src/'resources.jsonl').read_text().splitlines()];ends={x['name'].removeprefix('P6-'):x for x in rows if x.get('event')=='end'}
def count(name,k):
 p=src/(name+'.log');s=p.read_text() if p.exists() else '';m=re.findall(r'(?:ℹ |# )'+k+r' (\d+)',s);return m[-1] if m else '—'
def table(names):
 s='| Run | Exit | Pass / fail / skipped | Seconds | Peak MB | Limit MB |\n| --- | ---: | --- | ---: | ---: | ---: |\n'
 for n in names:
  d=ends[n];s+=f"| {n} | {d['code']} | {' / '.join(count(n,k) for k in ['pass','fail','skipped'])} | {d['seconds']} | {d['peakMB']} | {d['limitMB']} |\n"
 return s
s='''# VS1 rerun, 5 November 2026

Measured product: viewer `5c9940073f80ad4e90e075bc5e051a9b311ec047`, TEC-OS `78127ec63a2478c544af7fa96bfa73345f9df824`. The product code and pin were unchanged. Subsequent commits contain this evidence only. Measurements are supplied for the driver's judgment.

Gate authority: Origo `540802d8` (initial registration), `5b34f9b0` (VG8), `1e4b7503` (baseline at this pin) and VD-11 (acceptance of the amended references). The gate file read for this run had SHA-256 `b852326e83f0274af5a52d9b8bd3d14a6361d722ea9cd43086832278bb59306b`. The figures, references and failing inputs were preserved.

## Standing gates and full product suite

'''+table(['VG1-clean-1','VG1-clean-2','VG2','VG3','VG4','VG5','VG6','VG8','full'])+'''
VG1's two fresh remote clones started without `node_modules`, `build`, `dist` or `.inputs` in either repository. Each checked out the measured viewer commit and its gitlink, then ran the public `npm run page` path under the 600 MB guard. All 15 files in `dist/` were byte-identical, including the 265,305-byte HTML page. `manifest-1.json` and `manifest-2.json` contain every path and SHA-256. The ROM and seven card hashes passed the build's checks against `pins.json` in both clones.

VG3's eight passing assertions are seven boot configurations and the no-card control. They are not eight successful boot configurations. The separate control run below measures the no-card assertion alone.

VG4 exercised TAS at the prompt, the three expected output lines, editing the hello line in TED and ^T B followed by ^T R. VG5 compared the browser's stored upgraded card with the Node reference and checked refusal of the .DRV card. VG6 blocked every request but the HTML itself and checked both commit labels. These are emulator and Chromium measurements.

## Failing inputs

Exit 1 is the required result for the mutated inputs. Their test failures establish detection, not product regressions. CLI refusals have no Node test counts, shown as dashes.

'''+table(['VG1-old-ROM','VG1-hash','VG1-tracked','VG2-null-read','VG3-no-card','VG4-no-sample','VG5-no-prepare','VG6-missing-embed','VG8-copy'])+'''
- VG1 old ROM: rebuilt TEC-OS `1b9c51f`, verified SHA-256 `1f9eb404c7146902c9a306b16081d7886b122ef1b5867babeb98e00e68094e1c`, then put those bytes in the pinned checkout after its TEC-OS step. The bundle stopped with `not the pinned` and both ROM hashes.
- VG1 changed hash: one digit in SAMPLE.ASM's expected hash changed. The build named SAMPLE.ASM and the mismatching pinned hash.
- VG1 tracked file: an appended README line stopped the build with `tec-os has changes to tracked files`.
- VG2 null read: replacing the loadCard catch's throw with null failed with `Missing expected rejection: a failed read throws`.
- VG3 no card: the unchanged assertion passed by checking `CARD?` on the LCD and absence of `A>`.
- VG4 missing sample: removing SAMPLE.ASM from the recipe failed with `TAS's build: not within 400000000 cycles` and `cannot read file` at the prompt.
- VG5 skipped preparation: bypassing the page's prepareCard failed at `and not PICO.SVC's`, with `A>PICO.SVC` and `PICO.SVC?` still visible.
- VG6 missing embed: removing only the embedded ROM entry from a generated page failed at the existing 60-second prompt wait. The modified harness is retained alongside the log. Its total guarded duration includes browser setup and teardown.
- VG8 copy: copying host/card.mjs into the viewer failed with `host/card.mjs is tec-os/host/card.mjs`.

Each mutation was restored in a finally block. The VG5 recorder initially expected the TAP phrase `not ok` but Node emitted the spec reporter. The run failed at the correct assertion. Only the recorder's diagnostic match was corrected, with the correction retained in commands.jsonl. Neither the test nor the gate changed and that run was not repeated.

## Accepted result-review fixes

The seven product changes are covered as follows: removing VG7 by the full suite, pin-check equality by the off-pin control, refusing extra card files by its control, refusing a dirty label by its control, distinguishing untracked files by its control, sharing the static server by VG2's browser cases and using TEC-OS's packages by both dependency-free fresh viewer clones plus the full suite. The four record-side corrections have supporting registration references, exact failing-input outputs, VE-3's bounded failing run and all resource rows here. Their incorporation into VD-10 and the study ledgers belongs to the driver.

The off-pin control used TEC-OS `3d4f214`, the parent of the pin, with the same ROM hash. Its refusal therefore proves the gitlink check independently of ROM hashing.

'''+table(['review-off-pin','review-untracked','review-extra-file','review-dirty-label'])+'''
## Preparation and final checks

'''+table(['VS1-inputs','old-ROM-build','VG8-evidence','quick'])+'''
Every heavy job used the shared lock through `/Users/johnhardy/projects/origo/tools/mem-guard.mjs`. No guard exceeded its registered 600 or 700 MB limit. Peaks are sampled lower bounds. Queue waits are in resources.jsonl and are excluded from each run's elapsed time. The slowest initial local preparation took longer than the historical estimate, as the table records.

`commands.jsonl` records exact argument vectors, working directories and exit codes for the gates and controls. `clean.py` also records the precise clone, checkout, submodule update and clean-directory checks. The executable scripts and individual outputs are retained here. Scripts use `/tmp/p6-vs1-rerun` as their working evidence directory and restore mutated bytes before returning. Log output is preserved, including whitespace from screen diagnostics. The final checks ran after restoration and the first evidence commits. VG8 rechecked the added evidence files.

No publication, hardware work, source repin or phosphor change was performed.
'''
(dst/'README.md').write_text(s)
