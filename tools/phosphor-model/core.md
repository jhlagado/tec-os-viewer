# Reviewed core-only diagnostic: source packet

Prepared from Origo a1d49e00 / 4201abe9, `studies/p6-viewer/reviews/vs3-softening-causal.md`. Source implementation only. No browser, firmware build, model execution or guard queue is allocated. Independent final source review and explicit compute allocation precede the command below.

## Exact retained scope

One 600 by 900, DPR 1, zoom 1, old-font 80-reverse cell. Four browser captures: unchanged R, unchanged F, C75 = F plus CSS sigma 0.75px and C100 = F plus CSS sigma 1px. Core opacity stays 1 and blend normal. Halo and mask stay inactive throughout trials, refusals and restoration; there is no legacy mask capture or halo probe. Legacy and the first softening group retain their defaults and outputs.

A fifth comparison entry, Q, is explicitly synthetic. It exports the existing unclipped, quantized F gain-0.8/offset-7 image-space negative control inside `analyse`, then verifies its decoded pixel hash. It is not another browser capture or a fifth negative detector case. The four browser entries are shuffled A–D, with Q labelled E (synthetic) on the native contact sheet and its exact mapping retained.

The accepted source remains Viewer 76c4aa0 / TEC-OS fe2097f4, with existing frozen frames, font, source-byte hashes, six-by-eight cells and aspect. `core-reference.json` pins the retained 3ecab09 effects JSON to SHA-256 `ed1a068792233a959f67962ce2b47fc687c6a4286def48e9df3b0c76fa62d83e`. Both runner and analyser check that immutable hash and the original VRAM/font/RGBA identities before using the anchors. Current reference bytes were inspected against the committed 3ecab09 blob; no prior evidence changed.

Every capture must retain x=29, y=152.28125, width=542, height=406.5 CSS px, DPR=1 and zoom=1 exactly. The core selector uses an invisible historic softening-option sizer so longer ids do not reflow the pane; strict observed geometry checks still refuse any drift. The four source profiles retain their nine native coordinates, offsets, source anchors and detector rules from the retained effects file. The `_anchors`, `_metrics`, `_samples` and `_detect` ASTs remain identical to 3ecab09. No detector threshold was lowered.

## Controls and interpretation

Exactly four core browser refusals: stale main, disabled main filter, decoded pixel and decoded placement against unchanged expected VRAM/font. There is no prior fourteen-case count. After each routine, `finally` restores C100 and calls positive `verify()`, then restores R and calls positive `verify()` again. The runner checks both proofs and inactive halo/mask states.

Four image-space negatives remain identical F, a no-filter F copy, gain 0.8/offset 7 and gain 1.1/offset 2. The separate Pillow Gaussian calibration remains. Q is exported from one of those four existing negative paths. The complete source-anchored profiles and metrics are retained whether broadening resolves or not.

A complete four-profile demonstration requires all four at a candidate. Partial counts stay partial. If neither candidate resolves four profiles, record the limitation and stop. No automatic retry, escalation or mechanism switch exists. Even four profiles do not accept whole-font softness, normal/reverse reading, joined strokes, punctuation or a default. Stronger CSS filtering does not establish the internal reason for the earlier suppressed effects.

## Output retention and status

Only the new `evidence/vs3-model/core-softening/` directory, prefix `core-600-dpr1-80-reverse`, is written. Creation is exclusive: any existing directory, including an empty or failed packet, refuses a new attempt without modifying it. Source SHA/geometry checks and source-only preparation do not create that directory.

The atomic manifest begins incomplete. It remains incomplete through browser capture, analysis, Q export, SVG/PNG composition and cleanup. Only after all work and the final budget check succeed is it marked diagnostic-recorded, without presentation acceptance. Exceptions persist failed/incomplete phase and error metadata while retaining captures and progress. An external process kill can leave the earlier incomplete manifest; it is not a completed result. No packet is deleted or overwritten automatically.

## Held command

From `/Users/johnhardy/projects/tec-os-viewer`, at the final reviewed source commit, after explicit allocation:

```sh
TECOS_ROM_ASSEMBLER=atom node /Users/johnhardy/projects/origo/tools/mem-guard.mjs --limit 700 --wait 0 --name P6-VS3-core80 --log /tmp/p6-vs3-core-resources.jsonl -- node tools/phosphor-model/capture.mjs --group=core --viewport=600 --dpr=1 --frame=80-reverse > /tmp/p6-vs3-core-capture.log 2>&1
```

One zero-wait job, unchanged 700 MB cap. Planning estimate **5–15 seconds**, based on the prior 5.0-second/599 MB diagnostic, not a measurement of this changed packet. The timer requests cooperative browser close at 110 seconds; it is not a proved hard kill. Browser-operation and remaining-budget child timeouts remain. The coordinator must monitor the two-minute allocation boundary and require cleanup if the job has not returned. No runtime or queue was started during source preparation.

## Validation and remaining authority

Only JavaScript syntax checks, Python AST parsing and read-only source/reference/AST comparisons have run. The new runner, selector sizing, exact geometry, core restoration, exception retention, export/composition, timings and memory remain unrun. The existing anchored detector rules are preserved, not requalified by syntax checks. Production code, prior evidence and pins are untouched.

TEC Compact and the primary 40-column direction (VD-13/P3 KS48) remain chosen. This old-font detector packet cannot qualify the later chosen-font 40/80 reading at a qualified current pin. VS4 generated-output and recipe integrity remains required after presentation. No production effect, default, gate, pin, publication or hardware change is included.
