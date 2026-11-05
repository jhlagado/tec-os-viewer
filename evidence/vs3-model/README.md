# VS3 model: bounded narrow-80 checkpoint

Baseline: Viewer `76c4aa0`, TEC-OS `fe2097f4bad3f7578aa41b8bce8aa571c451dbc7`, ROM `a3dd9ee9763d94efff6b7a93a2cc8f9d7300f04a3e57f5cd0a5f24868f8ed6bb` and SAMPLE `0544eba7fbdb498d8d9114e64ad3ddbf48825e5430ee4665940ce82098ab6776`. ATOM remains selected. This checkpoint is model evidence, with no production presentation change or default selection.

## Completed scope

Fifteen real PICO frames are frozen: prompt, TED at source line 150, reverse text and hardware demo after cold boot at each of 32, 40 and 80 columns, plus one dedicated reading fixture per width. Each frame retains VRAM, registers, source dimensions, raw pre-effect RGBA bytes and hashes, text rows and source identity. `fixtures.json` identifies the font source and bytes by hash and the freezing tool commit `387e35e`. A separate host check validated every stored RGBA length and hash. DEMO itself takes Graphics I at 32 columns, so its actual decoded raster is 256 by 192 even when the preceding console was 40 or 80 columns. No artificial 80-column DEMO raster is substituted.

The one completed comparison cell is **600 by 900 viewport, DPR 1, 80-column reading fixture**, captured in headless Chromium. The candidate settings are fixed by the brief: R, S, G, L and the additional L mask-off fractional-scale control. Labels A–E are shuffled, with mapping in `600-dpr1-80-reading.json`. The browser version and exact settings are retained there.

All five variants consume the same complete pre-effect RGBA buffer, checked by SHA-256 against the frozen source. The visible sharp backing canvas is compared in full against independent nearest-neighbour enlargement, with the floor applied only at source-black pixels for G/L. Bounds stay at 542 by 406.5 CSS pixels, aspect ratio 4:3, zoom 1, horizontal source scale 1.05859375 device pixels and vertical row scale 2.1171875 device pixels. L's source-aligned cached last-quarter mask is active at this scale, and the additional L-off capture explicitly compares the fractional scale without that mask. G and L-off produce identical native PNGs, as expected. The model also checks suppression below two device pixels per source row.

The expected line is `0O 1Il []{} () ,.;: !? /\ -_=+ SAMPLE.ASM 186`, with the actual ROM cursor placed immediately after it. Reading frames are additional fixtures rather than modifications to the four required scene types.

## Images and reading limit

[PNG contact sheet](sheets/600-dpr1-80-reading.png) · [SVG contact sheet](sheets/600-dpr1-80-reading.svg). The five original PNGs are in screenshots/. The PNG contact sheet was composed offline with Pillow 11.3.0 after the browser export timed out. No screenshot was resized. Each image rectangle was checked byte-for-byte against its source pixels before and after writing the PNG. Input/output hashes, native rectangles, elapsed time and process peak are in contact-composition.json. Composition took about 0.094 seconds at a 40.42 MB process peak, without a browser or heavy job.

Independent blind review found shared 0/O, 1/I/l and bracket ambiguities in A–E. The filename and digits were readable. It found no reliable sharpness/glow ranking. Only one text line is shown, so line separation is unassessed. This is a reading limitation at this size, not a visual pass. Exact transcription strings and counts remain unset. `reading-review.json` preserves that review separately from the generated measurements. The raw-view control remains available and no default or size fallback has been chosen.

## Negative controls and model-only checks

At every width, a flipped glyph bit fails the independent font-bit check and a displaced glyph fails the known-position check: six detected glyph control cases in glyph-controls.json. The actual A and reverse-A patterns and pixels are derived from VRAM/registers and the pinned font, not from a rendered screenshot.

The stale-frame control keeps the current pre-effect source but supplies the prior prompt to the visible sharp layer in place of the current reverse frame. It fails `visible sharp frame mismatch`, demonstrating a presentation-boundary check rather than only a source-ID check.

The mock model page checks raw/effect switches, width selection, canvas keyboard focus and unchanged GLCD/serial sentinels. These are explicitly **model-page checks**. Production keyboard/touch, live width/effect switching, GLCD/serial isolation and the offline single-page workflow have not been rerun for VS3. Production renderer code and APIs remain unchanged.

Independent model review (Origo `136fe215`) supports the source and sharp-layer proof only. Glow source/current-frame consumption, computed CSS settings, mask alignment and the final live-layer composition still require independent checks. The configured settings in the result JSON are not a substitute for computed-style validation. The existing flipped-bit control mutates VRAM. A separate post-decode pixel mutation with expected VRAM unchanged is also required. These remain VS3 model obligations under the heavy-work hold, with no default or legibility acceptance.

## Costs, failed attempts and allocation hold

| Job | Exit | Seconds | Sampled peak MB | Cap MB |
| --- | ---: | ---: | ---: | ---: |
| P6-VS3-freeze | 7 | 9.2 | 133 | 600 |
| P6-VS3-freeze-corrected | 0 | 7 | 168 | 600 |
| P6-VS3-narrow80 | 0 | 3.4 | 495 | 700 |
| P6-VS3-quick | 0 | 2 | 237 | 600 |
| P6-VS3-narrow80-png | 1 | 33.1 | 501 | 700 |

The first freeze failed because it compared VCLAIM with 1 rather than the qualified claim bit. The host run stopped at 32-demo and independent source review identified CDCLM=10h. Commit 387e35e corrected the predicate to nonzero claim plus the graphics-mode check. The corrected run froze all fifteen frames and detected all six glyph controls.

The initial visual batch completed successfully with SVG and native PNG captures. The subsequent PNG-export attempt completed the candidate proofs and model checks, then timed out at Chromium's standalone-SVG full-page screenshot. Its failed attempt and full 33.1-second/501 MB cost are retained. The unused HTML-export repair was superseded by the tested offline native-pixel composer. capture.mjs now closes the browser phase before invoking that composer within its caller's existing guard; this final integration has not had another browser run under the allocation hold.

The quick check passed 4/4, zero failed or skipped. The later quick/export retry was withdrawn while still waiting for C13's lock, before any job started. Its shell exited 143 and its following browser capture did not start. No P6 heavy job remains running or queued. All further heavy VS3 work is held until the coordinator returns allocation. Exact commands and all acquired guard readings are retained in commands.json and resources.jsonl. No cap was exceeded.

## Remaining model work

All 72 required scene comparison cells remain: four scene types times three widths times six viewport/DPR combinations. Of the 18 additional reading-fixture cells, only 600/DPR1/80 is captured, leaving 17. Thus 89 frame/viewport/DPR cells remain, with four candidates and fractional mask-off comparisons as applicable.

No foreground performance timing cell has been measured. All eight candidate/workload jobs remain: R/S/G/L with frozen and changing content, each with 60 warm-up and 300 measured frames, JavaScript draw time, browser delivery and incremental memory. The browser module has a sampling hook, but it is unmeasured and not an accepted performance harness. The full visual matrix, resize/moiré observations, exact reading transcriptions, dense line-spacing assessment, touch focus, production regression checks and complete live-overlay boundary proof remain pending. No limits or gates have been set from these partial costs.

No publication, hardware work, production effect build or source repin was performed. Origo records were not edited.
