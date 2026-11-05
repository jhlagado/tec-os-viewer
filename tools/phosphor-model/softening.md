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
TECOS_ROM_ASSEMBLER=atom node /Users/johnhardy/projects/origo/tools/mem-guard.mjs --limit 700 --wait 0 --name P6-VS3-softening80 --log /tmp/p6-vs3-softening-resources.jsonl -- node tools/phosphor-model/capture.mjs --group=softening --viewport=600 --dpr=1 --frame=80-reverse > /tmp/p6-vs3-softening-capture.log 2>&1
```

This command is prepared, not run or queued. Source review must close and the coordinator must return allocation first. The group refuses a different viewport, DPR or scene so this is one bounded cell, not an implicit matrix run. ATOM remains explicitly selected even though this job performs no assembly.

The target is one job under two minutes at the unchanged 700 MB cap. Estimated elapsed time is **15–30 seconds**, based on the earlier **3.4-second / 495 MB** batch plus the new checks. That is an estimate, not a new measurement. At 110 seconds a timer requests `browser.close()`. This is a cooperative browser-close deadline, not a proved hard process kill or a guarantee that all cleanup completes by two minutes. Browser-operation timeouts and remaining-budget Python-child timeouts are also prepared. Actual memory, elapsed time and termination behaviour remain unmeasured. The zero-wait guard refuses a busy allocation instead of entering its queue.

## Prepared checks and refusals

- Compare the complete pre-effect buffer against the frozen source hash, and hash expected VRAM against its frozen identity. Parse the pinned font separately and verify its source and byte hashes. The existing known normal/reverse cells are checked with an independent font/position oracle.
- Compare the complete unfiltered main backing canvas against independent enlargement with only the declared floor. Its historical DOM id is `sharp` even when a CSS blur is applied to that layer.
- Compare the entire halo backing buffer against independent raw-source enlargement with **no floor**. This checks actual current-frame pixels, with separate source-frame and expected/observed buffer hashes.
- Read computed main filter, scaling, opacity, blend and transform, and computed halo filter, opacity, blend and visibility. Compare active overlay bounds with the main layer within 0.05 CSS px. Deliberately stale glow, disabled main/halo filters and a one-CSS-pixel shifted halo must be refused with named diagnostics.
- Parse the computed cached SVG mask source and compare all 192 row rectangles against an independent last-quarter-row oracle. Check viewBox, stretch, fill, opacity, background size/position, transform, overlay bounds and projected row intervals. Legacy mask-on/off screenshots are captured only as controls in the same 600/DPR1/80-reverse job. A shifted mask overlay and a changed row-band y coordinate must be refused. The mask must be suppressed at the small-size probe.
- Mutate a decoded pixel in the actual source canvas and swap the decoded normal/reverse cell rectangles. Test the observed pixels against **unchanged expected VRAM and pinned font**, then check that those reference hashes are still identical. These controls do not mutate the reference snapshot or font.
- Retain the stale-main-layer control. The softening controls and legacy control probes restore canonical styles and source buffers before returning. After each negative-control `finally`, the repaired effect pipeline is positively verified (H for softening, L for legacy), then raw R is restored and positively verified too. Both proofs are returned and checked by the capture caller. All checks are mock/model checks, not production workflow proof.

The PNG analyser is prepared to check final isolated floor pixels, halo change beyond a one-source-pixel ink margin, and active legacy mask darkening. Aggregate B1/B2 pixel differences remain diagnostics only. Edge-broadening evidence is supplied separately by the source-anchored profiles below. If a small blur has no resolved normalized edge broadening at this size, the report records that limitation rather than inventing a visual pass. Final comparisons allow one channel level for rounding. Floor samples exclude an eight-source-pixel ink neighbourhood and rounded borders. These detector rules, pixel-mapping assumptions and tolerances are unrun and submitted for source review, not acceptance thresholds.

Fourteen diagnostic cases are prepared: stale sharp, six softening controls and seven legacy controls. The capture caller checks their exact names, refusals and reference hashes against its own frozen metadata.

The planned native captures comprise five shuffled softening candidates A–E plus two legacy mask control captures. Each candidate retains its computed properties, source/glow proof and actual bounds. The native contact PNG is composed only after Chromium closes, within the same guard, to avoid overlapping browser and composition memory. No input screenshot is resized and pasted pixel rectangles are checked after encoding.

## Prepared source-anchored edge detector

`edge_profiles.py` anchors four profiles in the frozen normal-A and reverse-A cells: a horizontal scan across a vertical stroke edge and a vertical scan across a horizontal stroke edge for each polarity. It derives transitions from the pinned font and unchanged VRAM, validates those cell pixels against frozen raw RGBA, then picks the transition with the longest minimum neighbouring plateau in device pixels. It retains source code/cell/edge coordinates, runs on both sides, CSS capture bounds, all nine native sample coordinates and offsets. Screenshots are neither resized nor interpolated for these profiles. Neighbouring edges can be present, particularly in the narrow reverse glyph, and their samples remain visible in the record.

R/F/B1/B2/H retain sampled RGB, green, weighted encoded-RGB luma and min/max-normalized curves at those same coordinates. This is a digital luma proxy with no linear-light conversion, not photometric luminance. For B1/B2 versus F, the detector records normalized-shape RMS, an affine gain/offset fit and residual, effective gradient width, normalized gradient peak, centroid and variance. A resolved-broadening flag requires a non-affine shape change, an increased effective gradient width and a lower normalized gradient peak. Contrast must exceed 16 luminance levels, affine-fit residual must exceed one level and normalized shape must exceed a two-level quantisation allowance divided by the lower contrast. Width and peak resolutions derive from that allowance and native sample spacing. These unrun detector rules are submitted for review, not visual acceptance thresholds.

The detector retains which of the four source profiles resolve broadening and which do not. Partial evidence is explicitly labelled partial. No resolved profiles means nonobservable broadening at these samples, even if aggregate pixels differ or a computed CSS blur is present. This does not claim whole-font softness, reading quality or a candidate/default ranking. H samples are retained for inspection, but its halo is not attributed to main-filter blur.

Four image-space negative detector controls must produce zero observable profiles: identical F, a blur-disabled F copy, RGB gain 0.8 plus offset 7 and RGB gain 1.1 plus offset 2. The affine controls are quantized without clipping and do not blur the image. All control samples and fitted metrics are retained. A separate Pillow Gaussian-radius-one-CSS-pixel calibration must resolve at least one anchored profile so a constant-false detector is refused. That calibration is not a browser candidate. Expected font, raw RGBA and VRAM hashes remain unchanged throughout.

These four negative detector cases and the one positive calibration are additional to the fourteen browser diagnostic cases. The latter also return positive effect and raw proofs after restoration. All remain unrun under the current hold.

## Outputs and limits of this preparation

New files go under `evidence/vs3-model/softening/`, with the prefix `softening-600-dpr1-80-reverse`. Existing legacy captures, contact sheets, frozen RGBA and fixture identities are not overwritten. The new group retains a partial progress JSON as candidates are captured, the complete result and mapping, negative-control diagnostics, native captures, SVG/PNG sheets, composition metadata and final-effect analysis. The mask pair is control evidence, not a second completed comparison cell.

Only `node --check` on the JavaScript sources, Python AST parsing and source/diff inspection have run. No new control or edge detector has passed yet. Runtime assertions, computed CSS normalisation, halo freshness, mask alignment, screenshot-effect checks, bounds, memory, the deadline and export integration all remain unrun. No foreground draw/presentation timing, reading ranking, default selection, complete matrix, touch or production workflow acceptance is claimed. rAF sampling is labelled callback cadence rather than presentation timing, which remains separate work.

The later P3 offer 17 (`ea3ef3d`, SAMPLE line 204) is intake only. This model job continues to use accepted fe2097f4 and its existing frozen frames. No repin is prepared here.
