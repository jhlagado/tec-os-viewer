from run import *
import hashlib,re,shutil

# Retain the two initial shell invocations alongside the structured runner calls.
p=OUT/'commands.jsonl';rows=[json.loads(l) for l in p.read_text().splitlines()];known={x['name'] for x in rows}
for name,args in [('inputs',['npm','run','tecos']),('quick-pin',['npm','run','quick'])]:
 if name not in known:
  env={'TECOS_ROM_ASSEMBLER':'atom'}
  if name=='inputs':env['TECOS_ROM_TRACE']=str(OUT/'backend.jsonl')
  rows.append({'name':name,'cwd':str(ROOT),'env':env,'argv':['node','/Users/johnhardy/projects/origo/tools/mem-guard.mjs','--limit','600','--name','P6-VS2-'+name,'--log',str(OUT/'resources.jsonl'),'--',*args],'exit':0,'expectedExit':0,'observed':True})
p.write_text(''.join(json.dumps(x)+'\n' for x in rows))
assert all(x['observed'] for x in rows)

pins=json.loads((ROOT/'pins.json').read_text());before=json.loads(subprocess.check_output(['git','show','5b0a48d:pins.json'],cwd=ROOT,text=True))
assert [n for n in pins['files'] if pins['files'][n]!=before['files'][n]]==['SAMPLE.ASM']
for name,want in pins['files'].items():assert hashlib.sha256((ROOT/'tec-os/dist/files'/name).read_bytes()).hexdigest()==want
assert hashlib.sha256((ROOT/'tec-os/dist/tecos.rom').read_bytes()).hexdigest()==pins['rom']
backends={}
for name in ['inputs','VG9-clean-1','VG9-clean-2']:
 entries=[json.loads(l.split('tecos ROM ',1)[1]) for l in (OUT/(name+'.log')).read_text().splitlines() if l.startswith('tecos ROM ')]
 assert entries and all(x['backend']=='atom' for x in entries)
 assert any(x['target']=='tecos.rom' and x['phase']=='final' for x in entries)
 backends[name]=entries
(OUT/'backend-records.json').write_text(json.dumps(backends,indent=2)+'\n')
assert '"backend":"tas"' not in (OUT/'VG9-no-ATOM.log').read_text()
gate=pathlib.Path('/Users/johnhardy/projects/origo/studies/p6-viewer/gates-vs2.md').read_bytes();assert hashlib.sha256(gate).hexdigest()=='0e969c091a559c30193e637529ad9bbb7ad65d365e85a7a4441adc31616f961a'
resources=[json.loads(l) for l in (OUT/'resources.jsonl').read_text().splitlines()];ends={x['name'].removeprefix('P6-VS2-'):x for x in resources if x.get('event')=='end'}
def count(name,k):
 s=(OUT/(name+'.log')).read_text();m=re.findall(r'(?:ℹ |# )'+k+r' (\d+)',s);return m[-1] if m else '—'
def table(names):
 s='| Run | Exit | Pass / fail / skipped | Seconds | Peak MB | Limit MB |\n| --- | ---: | --- | ---: | ---: | ---: |\n'
 for n in names:
  d=ends[n];s+=f"| {n} | {d['code']} | {' / '.join(count(n,k) for k in ['pass','fail','skipped'])} | {d['seconds']} | {d['peakMB']} | {d['limitMB']} |\n"
 return s

s='''# VS2 qualification measurements

Product code: `d193838f5b8f13f8f0852984c3439a9272e09654`, on `vs2-green-console`. TEC-OS gitlink: `fe2097f4bad3f7578aa41b8bce8aa571c451dbc7`. Later commits retain evidence only. Main remains at the accepted VS1 evidence commit `5b0a48d`. This report supplies measurements for independent review and the driver's judgment.

Authority: VD-12 and Origo's VS2 registration `e3e8bf84865ee895fc672ace511576ebaffa1e7a`. The gate file's locked SHA-256 is `0e969c091a559c30193e637529ad9bbb7ad65d365e85a7a4441adc31616f961a`. The registered figures, references, limits and failing inputs are unchanged. VS1's readings remain in its own evidence.

## Product changes

The gitlink and pins changed together, committed before checking because the checker reads HEAD's gitlink. The ROM hash is `a3dd9ee9763d94efff6b7a93a2cc8f9d7300f04a3e57f5cd0a5f24868f8ed6bb`. SAMPLE.ASM is `0544eba7fbdb498d8d9114e64ad3ddbf48825e5430ee4665940ce82098ab6776`. The six other hashes are unchanged and match the rebuilt files.

The build explicitly selects ATOM, passes `TECOS_ROM_ASSEMBLER=atom` to child commands and rejects a conflicting selection. README shows the selected environment and refers to TEC-OS's documented TAS default and its host/compiler inputs. This qualification uses ATOM. `backend-records.json` retains the ATOM probe, final ROM, COM and media traces from the local build and both fresh clones. No ATOM fallback was used.

The worked-example test compares the whole on-card record payload with the pinned source after CRLF and EOF conversion and zero record padding. It derives the greeting's line and insertion offset from those actual card bytes, checks line 186, moves right 22 source characters and inserts `the `. It checks the exact edited source, output `Hello from the TEC-OS.` and cursor `L186 C27` both after editing and after execution returns to TED. The build/run path still uses normal matrix keyboard input at the prompt and in TED.

The new green-console test checks three cold widths and all six directed width pairs. PUTAT through ABI 5 places normal A and reverse A at row 2, columns 3 and 4. The assertions compare their VRAM names and patterns against the source font and its bitwise complement. The Viewer decoder must produce exact RGBA pixels for light green palette entry 3 (`5edc78`) and black entry 1. Every pixel in both cells is checked, including padding. Register 7 must be 31h and every one of the 32 Graphics I colour groups must be 31h. Geometry is 512 by 192 with six-pixel cells and a 16-pixel left border at 80 columns, 256 by 192 with six-pixel cells and an eight-pixel border at 40 and 256 by 192 with eight-pixel cells and no border at 32. Diagnostic rows retain patterns and complete decoded-frame hashes.

## Positive checks

'''+table(['VG9-clean-1','VG9-clean-2','VG10-exact-cursor','VG11','VG12-exact-cursor'])+'''
Both VG9 runs started from fresh remote clones, with no node_modules, build, dist or .inputs in either repository. Each checked out product code d193838 and its offered gitlink, then ran `TECOS_ROM_ASSEMBLER=atom npm run page` under the 600 MB guard. `manifest-1.json` and `manifest-2.json` show byte-identical complete dist trees: all 15 files, including the 266,205-byte self-contained page. The ROM, sample and six unchanged card hashes match their pins. Backend traces confirm ATOM in both builds.

VG10 has two test cases: exact card source/coordinates and the prompt/TED workflow. VG11's 17 cases comprise seven VS1 board configurations, the no-card assertion, three cold PICO widths and six directed switches. The full suite passes 44 tests, zero failed and zero skipped. It includes moved tests, stored-card upgrade/refusal, keyboard/touch, damaged-entry download handling, the copy boundary and an offline page labelled with both commits, with every external request blocked.

The initial runs below preceded a tightening of the cursor assertions: a word boundary now prevents column 27 matching column 270. The registered exact coordinates did not change. VG10 and the full suite were rerun at the final product code. VG11's pin, ROM, decoder and harness were unchanged. Its nine green-console cases were also rerun after the palette control was restored.

'''+table(['VG10','VG12'])+'''
## Registered failure controls

All 13 controls detected their inputs. Exit 1 and failed test counts are the expected detector results. CLI refusals have no Node test counts, shown as dashes.

'''+table(['VG9-prior-ROM','VG9-hash','VG9-tracked','VG9-off-pin','VG9-untracked','VG9-no-ATOM','VG10-no-sample','VG10-old-line','VG11-prior-palette','VG12-null-read','VG12-no-prepare','VG12-missing-embed','VG12-copy'])+'''
- Prior ROM: rebuild the accepted VS1 source at `78127ec` using ATOM, verify `8cad4092…`, then replace the new ROM after the TEC-OS step. The bundle refuses it with both hashes and `not the pinned`.
- Changed hash: change one digit of SAMPLE.ASM's expected hash. The bundle names the file and mismatching hash.
- Dirty tracked submodule: append a line to its README. The bundle reports `changes to tracked files`.
- Off-pin checkout: check out parent `1636f66` while retaining the rebuilt artifacts. The bundle reports `not the viewer's pin`.
- Untracked submodule file: add vs2-untracked.txt. The bundle reports `has untracked files`.
- Missing ATOM: after installation remove its package temporarily and run the selected `npm run build` substep in TEC-OS. It stops with `Cannot find package 'atom-z80'`. It emits no TAS backend trace. The package is restored in finally.
- Missing sample: omit SAMPLE.ASM from the page recipe. The source comparison reports the missing file and the workflow fails at `TAS's build`, with `cannot read file` on the screen.
- Prior line: change only TED's requested line to 128. The source comparison still passes, but the workflow fails at `TED at the hello line`, with L128 C1 in its screen output.
- Prior palette: use the verified VS1 ROM as the machine's ROM input, while keeping the page's rebuilt card and the new test. All nine cases fail at the palette comparison: register 7 is F1h instead of 31h. This reaches the display comparison rather than stopping at a pin check.
- loadCard mutant: return null instead of throwing on a read error. KE-164 fails with `Missing expected rejection: a failed read throws`.
- prepareCard bypass: omit the page's preparation call. The stored-card test fails at `and not PICO.SVC's`, with the obsolete startup command still on the screen.
- Removed embed: remove the ROM entry from an otherwise generated single page. It fails at the existing 60-second prompt wait, within the registered two-minute budget including browser setup and teardown.
- Copied file: copy host/card.mjs into the Viewer. The boundary test fails with `host/card.mjs is tec-os/host/card.mjs`.

The controls restore mutated files, checkout and package in finally blocks. The removed embed exists only in the external test's served buffer. The prior ROM input is reproducible by prior.py and recorded by hash, so the binary itself is not retained in this repository.

## Preparation, quick checks and restored checks

'''+table(['inputs','prior-ROM-build','quick-pin','quick-tests','quick-cursor','quick-restored','VG11-restored','copy-boundary-evidence'])+f'''
All {len(ends)} recorded heavy jobs used the global guard serially at their registered 600 or 700 MB limit. Their total measured run time is {sum(d['seconds'] for d in ends.values()):.1f} seconds, excluding queue waits and clone setup outside the guard. The highest sampled peak is {max(d['peakMB'] for d in ends.values())} MB. No limit was exceeded. Peaks are sampled lower bounds. resources.jsonl retains each start, end, limit, duration and queue wait.

Exact commands, working directories, selected environment and exit codes are in commands.jsonl. run.py contains the guard invocation, clean.py the clone/checkout and clean-directory checks, controls.py the failure controls and prior.py the prior-ROM/palette check. Log output is retained unchanged, including whitespace in screen diagnostics. The scripts use /tmp/p6-vs2 as their evidence directory. All qualifying assembly commands and subprocesses explicitly inherit TECOS_ROM_ASSEMBLER=atom.

This is Node/emulator and Chromium evidence. There was no publication, hardware work or phosphor change. Origo's records and main were not edited.
'''
dst=ROOT/'evidence/vs2';dst.mkdir(exist_ok=True)
for p in OUT.iterdir():
 if p.is_file() and p.suffix in ['.py','.log','.json','.jsonl','.txt','.mjs','.sha256']:shutil.copy2(p,dst/p.name)
(dst/'README.md').write_text(s)
print('report',len(ends),'runs',flush=True)
