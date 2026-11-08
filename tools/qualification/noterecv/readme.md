# Isolated notice source

SOURCE_ONLY_UNRUN. These eight files implement the prospective NS1–3
contract admitted by Origo reviews/notsrc01.md at c49abc2c. They do not
wire notices into the Viewer. No import, check or runtime has run here.

The source base is engineering 8d64ec50b37846dc757a1c822222ee31b79c78a6.
All existing files and the 26 historical cmprecv files remain unchanged.
Current production 995069f and its sample-only c8 firmware need a separate
root-owned composition before integration. This canonical Compact fixture
does not describe the current old-font page.

## Pure API

`tools/notices.mjs` has exactly two named exports:

- `validateNotice(bytes, format)` accepts a Uint8Array or Buffer. Explicit
  `null` means missing input and throws an Error with code NOTICE_MISSING.
  Wrong byte length throws NOTICE_LENGTH before SHA-256 validation.
  Same-length altered input throws NOTICE_HASH. Authentication precedes
  UTF-8 conversion and artifact construction. Undefined is unsupported
  input and throws NOTICE_BYTES, rather than implying a missing file.
- `serializeNotice(text, format)` accepts text and either `directory` or
  `standalone`. It escapes ampersands before angle brackets. Quotes and
  newlines remain text. It returns `{html, external}`, with HTML as a
  string and a copied UTF-8 Buffer for directory external bytes.
  Standalone external is explicitly `null` and requires no external file.

Unsupported formats throw NOTICE_FORMAT. Non-string serializer input
throws NOTICE_TEXT. These checks have no additional qualified cases or
compound-fault precedence claim. No error returns an artifact. The helper
has no file, environment or process access and runs no checks at import.
It imports only node:crypto. Module constants define fixed markup.
The future build consumer would write directory bytes as FONT-NOTICES.txt.

## Independent literals and eleven observations

The five DATA fixtures were frozen before helper or adapter construction.
`notice.txt` is the complete canonical 962853f Compact notice from retained
M0 input, 2642 bytes with SHA-256
`577c3e97edcf1d7e183f4b668ec93a3125c90a414a6203fb3194ba6a6c612b41`.
Its original source references and attribution limits remain literal.
`canon.htm` is the independently fixed prefix, full notice and suffix.
`synt.htm` comes from the original fixed M0 synthetic HTML literal.
Neither HTML fixture was produced by executing a serializer.

`cases.dat` preserves all ten original M0 notice declaration objects and
order. Six negative inputs are explicit null, final-LF removal and byte-0
XOR 1 in each format. Each requires its exact named error and a null return
artifact. Positive canonical and synthetic cases compare every HTML byte,
decode the text and require exact external bytes or explicit null.
Fixture identities are checked before any case. Generic exceptions and
setup errors never count as passing semantic negatives.

The separate eleventh observation is `escaping-amp-omission`, standalone
synthetic input. The adapter reads the helper source and requires exactly
one literal `text.replaceAll('&', '&amp;')` site. It replaces only that site
with `text` and imports that isolated source as a data URL. The same
serializer body retains both angle escapes and all markup. This mutation
adds no product API flags and changes no maintained file.

`expect.dat` fixes the complete mutant output before implementation:
109 bytes, SHA-256
`8ccda6063a3f0792e1bbd237917ad802e4b34e3e693b22a4309779297cc8ba26`.
The first mismatch against the 113-byte independent oracle is byte offset
80, counting from zero. Only that complete actual literal, exact mismatch
and null external value satisfy the contrast. The capture retains both
full HTML values, source mutation, hashes and the first mismatch.
Eleven prospective observations do not extend historical M0 coverage.

## Capture and pending command

The isolated adapter takes one output pathname. It exclusively creates a
single aggregate with a 65536-byte bound, writes every byte and fsyncs the
file and parent directory. It retains partial observations, the active
case and first error on failure. A missing parent or I/O error terminates
unsuccessfully. Output inside the fixture directory is rejected. Capture
paths and source identities still require a separately sealed offer.
The adapter imports only the helper and Node builtins. No package script,
default test, pin, page, build or historical model imports it.

There is no launcher, provider inventory, live permit or actual authority
in this packet. A different complete implementation and command review
must precede execution. Future pricing remains five roles, O + 4T + 8 MiB,
600 MiB, effective heap 64 below maximum 450, wait 0, timeout 112 + 1,
outer 118 and external 120. Old M0 timing and resource use are not fit proof.

Full receiving M3, Compact pin/font adoption, build delivery, served DOM,
offline/standalone validation, presentation, VS4, phosphor and Mac/native
requirements remain open. This source milestone supplies no such credit.
