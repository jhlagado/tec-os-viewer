# Viewer receiving policy model

This packet prepares the 34 M0 host cases admitted for source authoring by
Origo VD-15 at b1af49a9. It changes no production page or firmware pin.
The command is inactive. Independent source review and a published root
allocation must precede execution.

`cases.dat` preserves the original declarations byte for byte. Only its
`hostCases` run here: 17 width/storage cases, ten notice cases and seven
identity cases. The scene and browser declarations remain data. `oracles.dat`
fixes the synthetic text, literal HTML, single mutations and first reason
codes before model authoring. The driver compares results with these separate
oracles. A generic exception cannot satisfy a declared negative case.

The width model applies 32, 40 or 80 columns. Missing, invalid and unavailable
storage start at 40. A failed write leaves the selected session width in use
and preserves the old stored value for reload. These are proposed receiving
semantics, not observations of the current Viewer page.

The notice model checks the exact canonical bytes before serialising text.
Directory output includes a notice copy and inline HTML. Standalone output
contains inline HTML only. The separate escaping fixture contains angle
brackets, an ampersand and quotes. Exact literal HTML and decoded text are
checked without a browser or DOM. The canonical notice has 2642 bytes and no
characters needing this escaping. Its HTML has 2721 bytes. Missing, truncated
and one-byte-changed inputs require NOTICE_MISSING, NOTICE_LENGTH and
NOTICE_HASH respectively. Failed notice cases produce no notice artifact.

The identity model checks ROM, font, dependency inventory, app body, recipe
body and notice body in that order, then PICO version 3. Each of the seven
negative cases changes one field. The dependency fixture is the exact retained
host runtime inventory. The served-body fixtures are archived upstream bytes.
They establish host policy behaviour, not actual HTTP delivery, browser
execution or the installed Viewer dependency tree.

`inputs.dat` records the complete unchanged 37-artifact archive and all 24
P6 generated-input rows. `inputs/archive.bin` preserves the original compressed
archive. Only the finite active fixtures are copied separately. SAMPLE source
is recovered from the archived 5106-byte delivered file by removing its final
EOF byte and converting CRLF to LF. The result is the original 4874-byte
source with SHA256 916357ae8e71b2264f0dc73f79ba801b44ea408cc39910d27de6dce41daf2d52.
The current TEC-OS SAMPLE source is not substituted. The recovery is DATA work
and provides no card, cursor, generated-symbol or native proof.

The future command runs `launch.py` under isolated Python with a cleared
four-key environment. The outer starts GNU timeout, the unchanged shared
guard and one Node driver. The driver checks effective child denial before
importing `model.mjs`. It retains its actual PID, direct guard PPID, argv,
Node flags and complete environment. Filesystem permissions are broad enough
for sealed source and fresh outputs. They are not a filesystem sandbox.

`offer.dat` seals the source rows and provider closure. The offer excludes its
own digest from its member list to avoid a self-reference. A later allocation
binds the actual offer digest. The outer passes that digest as M0_OFFER_SHA.
The driver checks it and archives the offer with all other source files.
The resulting environment also contains the guard's ORIGO_GUARD and exact
NODE_OPTIONS heap64 setting. Neither old C5 measurements nor any previous
Viewer proof counts as this command's memory or timing result.

Normal retention consists of every sealed source copy, 34 individual case
readings, six notice files and four aggregate files. `files.dat` inventories
every other output. All files are exclusive, fsynced, singly linked and mode
0600 in private 0700 directories. The maintained packet is mode 0644. A first
failure retains completed readings and a bounded failure record when the
output directory exists. Setup failures remain in raw captures. There is no
retry, warm-up, sweep or automatic allocation.

The original 44 Viewer tests, VS3/VS4 browser work, Mac B/R/700 MiB requirements
and A5 native positive/failing pair remain unchanged and unresolved by M0.
No D or B lifecycle proof, native success, browser pass, production witness
or gate acceptance follows from this packet.
