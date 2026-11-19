# TAS progress bundle

20 November 2026 (Australia/Melbourne).

The former TEC-OS pin `318812f` shipped Thorium `7a217f9` TAS:
11,013 bytes, SHA-256
`8e1f0efb662e5d6bab5e2b7f9479bc60d6f989d07fb22d11c9ffc70e2f5ed359`.
Those exact bytes were also decoded from the standalone HTML on the
previous `gh-pages` commit `27202c8`.

The new TEC-OS pin `c95dfa9` selects the progress build and host runner
from Thorium `9752fde`, on `ted-paged-native`. Thorium main does not yet
include it. TAS is now 11,098 bytes, SHA-256
`00e34db203603062c985c31ee53bdd21cb505281d388c8d64155d31cd9b6ccc4`.
The runner update is required: the old runner rejects direct console BDOS 6.

The distribution chain is TEC-OS `test/inputs.json` → verified `.inputs`
→ `tools/media.mjs` → `dist/files/TAS.COM`, recipe and starter image →
viewer gitlink and `pins.json` → `tools/build.mjs` → `tools/page.mjs`.
The standalone HTML's embedded TAS has the complete new hash above.
Only TAS changes among the 17 card files. ROM, TED and Snake9 hashes
remain unchanged. The observer's debug-map hash reflects the new generator
commit; ROM, symbol-map hash and opcode bindings remain unchanged.

Validation: Thorium self-hosted fixed point and 52 host tests; TEC-OS
build/media and 13 TAS integration tests; 38 viewer tests covering the
bundled card, boards, manifest checks, guest observer, SAMPLE from TED,
bundle size and standalone browser boot with external requests blocked.
The browser test used system Chromium 156 after the Playwright browser
download was denied with HTTP 403.

`test/tas-progress.test.mjs` reads TAS back from the built card and observes
96 ordered spinner frames during each actual Snake9 assembly invocation.
`TAS SNAKE9.ASM` selects COM output and correctly refuses origin 4000H;
`TAS SNAKE9.ASM SNAKE9.BIN` succeeds and reproduces the shipped BIN records.
The parser defaults an omitted source type to ASM and output type to COM.

These changes are published on task branches. The live Pages deployment
has not been changed. Build the review branch with `npm run page`.
Detailed provenance and retained logs are in
[Origo](https://github.com/jhlagado/origo/blob/fix/tas-progress-distribution/studies/p2-thorium/reports/tas-progress-distribution.md).
