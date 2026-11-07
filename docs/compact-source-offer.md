# Compact font and cold 40-column source offer

This is the firmware offer available for viewer adoption preparation. It does
not change the gitlink, card pins or qualified viewer baseline.

| Source role | Exact TEC-OS commit |
| --- | --- |
| Current viewer dependency | `fe2097f4bad3f7578aa41b8bce8aa571c451dbc7` |
| Upstream tested Compact source | `8b8664a7d93c6dc2e8bce509b9770585e106eedc` |
| Canonical qualified offer | `962853f499f05faf281f6cdff1deca8959f58c2b` |
| Later local-server source descendant | `be144a5e154a2538905a90dd145075e6f4c546d9` |

Canonical962 differs from tested8b8664a only in two qualification record files.
The later be144 descendant changes README.md and package.json to add a local
server command. This source relationship does not transfer qualification to
that descendant. Debugger-support candidates are separate offers and are not
this viewer's dependency.

| Offered item | SHA-256 |
| --- | --- |
| Main ROM | `fa63989b65d1e7e7a07f45e2a2b33e52f785d74216a3fde38af86b2d913f302d` |
| Diagnostic ROM | `17e4aae5e7944fef60997123b8c41ac7c8a06eea2564dc339ecfa38395911665` |
| Chosen 768-byte font | `5d732cefca4013fe6082728a00cae5e3aceaf3e6eb99aaa31e0289c0b3efe1d8` |
| Complete production notices | `577c3e97edcf1d7e183f4b668ec93a3125c90a414a6203fb3194ba6a6c612b41` |

P3 qualified two identical ordered741-case runs upstream. The offer includes
the earlier correctness/source-export changes, cold PICO40 and the chosen
font. Bare CRT/PICO preserves the chosen width/claim; explicit32/40/80 remains
supported. The public host argument still defaults to80, ABI remains5.1 and
the PICO record remainsv3. It provides no future debugger-support interface.

The current viewer explicitly supplies its session width to `prepareCard`.
Therefore the new ROM's cold40 default alone cannot give a fresh viewer
session40. The receiving design proposes preserving saved32/40/80 choices,
using40 for missing/invalid/unavailable storage, and keeping the public host
default unchanged. This policy is not implemented here.

The remaining receiving work belongs in this product repository:

- Adopt an exact reviewed firmware pin and its complete regenerated input
  hashes together; qualify the full delta from fe209, including earlier offers.
- Implement and check the session-width policy, raw cold boot, saved and
  explicit widths, supported32 and every directed width transition.
- Deliver the complete canonical font notices in both directory and offline
  standalone output. The prepared design uses `dist/FONT-NOTICES.txt` plus a
  discoverable complete inline disclosure; current build tools do not do this.
- Derive greeting/insertion/cursor anchors from actual offered card bytes.
  The source inventory predicts greeting line204 and edited `L204 C27`;
  generated card, cursor and edit/save/build/run/reopen still need observation.
- Verify ROM, recipe, card files, maps/symbols, font/import identity,
  normal/reverse/cursor behavior, GLCD/serial and card failure/atomicity paths;
  run the full viewer qualification and deterministic clean-clone builds.

The source authority is Origo `studies/p6-viewer/intake.md`,
`stages/compact-source.md`, `research_notes/compact-receiver-inputs.json` and
`models/compact-receiver`, with P3's proposal18 and Compact result review.
Viewer-owned guard/native engineering sources have been relocated into
[tools/qualification](../tools/qualification/README.md), with an exact
[original-to-product migration map](../tools/qualification/migration-map.json).
They remain unrun and inactive; that relocation supplies no Mac provider,
native qualification or receiving result.
Those source-only preparations do not grant implementation or runtime
acceptance. New receiving checks, exact command/closure/resource review and
allocation precede qualification. Old screenshots, baseline fixtures and
VS1/VS2 results keep their original source identities. Phosphor selection,
generated-output integrity work and native admission remain separate duties.
