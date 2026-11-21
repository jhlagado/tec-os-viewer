# Character LCD display

The Viewer draws the current TEC-1G twenty-column, four-row LCD as five-by-eight
dot characters. It uses the controller's displayed bytes, custom character
memory and display state. Snake9's inverse menu letters are custom characters,
so the selected difficulty remains visible as its program changes the glyphs.

The renderer includes eight programmable glyphs and their mirrored character
codes 08h–0Fh, the A00 character ROM, display on/off, reported display shifts,
underline cursor and a blinking block cursor. Glyph changes repaint even when
the displayed character code is unchanged. Cursor blinking continues while the
CPU is paused. Ordinary labels remain in the canvas fallback text and its
accessible label. Arbitrary custom cells are identified as custom symbols.

The display uses the runtime's current row-local modulo-twenty shift model.
It does not add a complete physical two-by-forty DDRAM shift model, five-by-ten
characters or a configured forty-column board. Those require additional
runtime/hardware modelling. This drawing work does not select the LCD as an
OS console or change MON3, Snake9 or guest memory.

## Font source

The 2,048 A00 glyph bytes in src/lcd-a00.mjs are retained from
[jhlagado/debug80](https://github.com/jhlagado/debug80/blob/53853ec2968abd8513d915efa5cda621dc7ba4a3/apps/debug80-vscode/webview/tec1g/hd44780-a00.ts).
That Debug80 package declares GPL-3.0-or-later, matching this project. Glyph
byte SHA-256: 0977c639c2445c5d19d44257711bbd9e2ae0f7da37206193e957df5871a202c6.
The renderer is implemented here against the runtime payload. No external
font request or browser font substitution supplies its LCD dots.

## Qualification status

The renderer and existing card-lifecycle checks pass 22 tests. Two actual
browser cases pass using the shipped Snake9 BIN through MON3, including
inverse menu labels, changes to custom patterns, paused cursor blink and reset.
These are emulator results; physical-board testing is separate.

The renderer adds 6,561 normalised module bytes. The owner accepted a
155,026-byte Viewer module ceiling on 21 November 2026; the former
146,834-byte ceiling failed by 6,003 bytes. This changes the browser budget
only, with no TEC-OS ROM or Z80 RAM cost. Full receiving integration and
complete Viewer qualification remain required before publication.
