// Deliver the page's queued keys.
// The machine holds a matrix key down
// until TEC-OS's own scan has read it.
// TEC-OS scans the matrix only while
// CON: is CRT: or UC1:, so under CON
// TTY or CON BAT that scan never comes:
// the key would stay down and every
// later key would wait behind it. So
// on those consoles a matrix key is
// held for HOLD_CYCLES, long enough for
// a MON-3 program to see it, and then
// let go. Until STARTUP.CMD has run, a
// key waits as before: on the GLCD
// board the matrix becomes the console
// only when GLCD.SVC is in, a second or
// two after reset.

/** A tenth of a second at the page's 4 MHz. */
export const HOLD_CYCLES = 400_000;

/** True once M's STARTUP.CMD has run. */
function started(m) {
  const pos = m.symbols.get("STPOS");
  return pos === undefined || (m.read(pos) & 0x80) !== 0;
}

/** Move M's key queue on by one step. */
export function pumpKeys(m, hold = HOLD_CYCLES) {
  const head = m.pending?.[0];
  if (head?.via === "matrix" && head.down && started(m) && !m.videoConsole()) {
    head.heldFrom ??= m.cycles;
    if (m.cycles - head.heldFrom >= hold) {
      if (!head.up) {
        m.tec1g.applyMatrixKey(head.combo.row, head.combo.col, false);
        if (head.mod !== undefined) m.tec1g.applyMatrixKey(0, head.mod, false);
      }
      m.pending.shift();
      return;
    }
  }
  m.pumpInput();
}
