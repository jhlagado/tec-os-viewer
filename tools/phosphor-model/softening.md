# Next bounded VS3 job: softening source preparation

Source only, prepared for independent review and a new compute allocation. No new browser, quick check, firmware build, guarded job, image capture or effect measurement has run during this preparation. Syntax checking is the only executed validation. The accepted baseline remains Viewer 76c4aa0 / TEC-OS fe2097f4 and the existing frozen frames. Production code and earlier evidence are unchanged.

The earlier local model URL with no query remains the legacy R/S/G/L page, initially raw 80-reading. The separate `?group=softening` URL has R/F/B1/B2/H and starts raw 80-reverse. It does not change a production default. The softening group always has the row mask off.

## Fixed trial inputs

All candidates keep the existing nearest-neighbour 1024 by 768 canvas enlargement after decode. Only the final CSS rendering and the explicitly listed layers differ. The raw font, VRAM, character grid and aspect ratio are unchanged.

| Candidate | Final CSS scaling | Source-black floor | Main-layer filter | Raw-source halo |
| --- | --- | --- | --- | --- |
| R | pixelated | none | none | none |
| F | auto | RGB 0,8,2 | none | none |
| B1 | auto | RGB 0,8,2 | blur 0.25 CSS px | none |
| B2 | auto | RGB 0,8,2 | blur 0.45 CSS px | none |
| H | auto | RGB 0,8,2 | blur 0.25 CSS px | opacity 0.22, blur 1.6 CSS px, screen blend |

The halo is copied from raw source pixels before the floor. Legacy G/L remain at opacity 0.16 and halo blur 1.2 CSS px, with no main-layer blur. Legacy L retains its last-quarter row mask and the two-device-pixel suppression rule. Settings are in settings.mjs and are recorded with each future result.

## Exact command, after review and allocation only

Run from `/Users/johnhardy/projects/tec-os-viewer` on the reviewed `vs3-phosphor-model` commit:

```sh
TECOS_ROM_ASSEMBLER=atom node /Users/johnhardy/projects/origo/tools/mem-guard.mjs --limit 700 --name P6-VS3-softening80 --log /tmp/p6-vs3-softening-resources.jsonl -- node tools/phosphor-model/capture.mjs --group=softening --viewport=600 --dpr=1 --frame=80-reverse > /tmp/p6-vs3-softening-capture.log 2>&1
```

This command is prepared, not run or queued. Source review must close and the coordinator must return allocation first. The group refuses a different viewport, DPR or scene so this is one bounded cell, not an implicit matrix run. ATOM remains explicitly selected even though this job performs no assembly.

The target is one job under two minutes at the unchanged 700 MB cap. Estimated elapsed time is **15–30 seconds**, based on the earlier **3.4-second / 495 MB** batch plus the new checks. That is an estimate, not a new measurement. There is a 110-second internal work deadline, shorter browser-operation timeouts and a remaining-budget timeout for the Python children. Actual memory, elapsed time and cleanup behaviour remain unmeasured.

## Prepared checks and refusals

- Compare the complete pre-effect buffer against the frozen source hash, and hash expected VRAM against its frozen identity. Parse the pinned font separately and verify its source and byte hashes. The existing known normal/reverse cells are checked with an independent font/position oracle.
- Compare the complete unfiltered main backing canvas against independent enlargement with only the declared floor. Its historical DOM id is `sharp` even when a CSS blur is applied to that layer.
- Compare the entire halo backing buffer against independent raw-source enlargement with **no floor**. This checks actual current-frame pixels, with separate source-frame and expected/observed buffer hashes.
- Read computed main filter, scaling, opacity, blend and transform, and computed halo filter, opacity, blend and visibility. Compare active overlay bounds with the main layer within 0.05 CSS px. Deliberately stale glow, disabled main/halo filters and a one-CSS-pixel shifted halo must be refused with named diagnostics.
- Parse the computed cached SVG mask source and compare all 192 row rectangles against an independent last-quarter-row oracle. Check viewBox, stretch, fill, opacity, background size/position, transform, overlay bounds and projected row intervals. Legacy mask-on/off screenshots are captured only as controls in the same 600/DPR1/80-reverse job. A shifted mask overlay and a changed row-band y coordinate must be refused. The mask must be suppressed at the small-size probe.
- Mutate a decoded pixel in the actual source canvas and swap the decoded normal/reverse cell rectangles. Test the observed pixels against **unchanged expected VRAM and pinned font**, then check that those reference hashes are still identical. These controls do not mutate the reference snapshot or font.
- Retain the stale-main-layer control. The softening controls and legacy control probes restore canonical styles and source buffers before returning. All checks are mock/model checks, not production workflow proof.

The PNG analyser is prepared to check final isolated floor pixels, halo change beyond a one-source-pixel ink margin, and active legacy mask darkening. It records B1/B2 raster differences relative to F. If a small blur has no raster-observable effect at this size, it records that limit rather than inventing a visual pass. Final comparisons allow one channel level for rounding. Floor samples exclude an eight-source-pixel ink neighbourhood and rounded borders. These detector rules, pixel-mapping assumptions and tolerances are unrun and submitted for source review, not acceptance thresholds.

The planned native captures comprise five shuffled softening candidates A–E plus two legacy mask control captures. Each candidate retains its computed properties, source/glow proof and actual bounds. The native contact PNG is composed only after Chromium closes, within the same guard, to avoid overlapping browser and composition memory. No input screenshot is resized and pasted pixel rectangles are checked after encoding.

## Outputs and limits of this preparation

New files go under `evidence/vs3-model/softening/`, with the prefix `softening-600-dpr1-80-reverse`. Existing legacy captures, contact sheets, frozen RGBA and fixture identities are not overwritten. The new group retains a partial progress JSON as candidates are captured, the complete result and mapping, negative-control diagnostics, native captures, SVG/PNG sheets, composition metadata and final-effect analysis. The mask pair is control evidence, not a second completed comparison cell.

Only `node --check` on the JavaScript sources, Python AST parsing and source/diff inspection have run. No new control has passed yet. Runtime assertions, computed CSS normalisation, halo freshness, mask alignment, screenshot-effect checks, bounds, memory, the deadline and export integration all remain unrun. No foreground draw/presentation timing, reading ranking, default selection, complete matrix, touch or production workflow acceptance is claimed. rAF sampling is labelled callback cadence rather than presentation timing, which remains separate work.
