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
// let go. The next key waits as long
// again with no key down, since a
// MON-3 program counts a key only when
// it goes down after a gap. Until
// TEC-OS's startup is over, a key
// waits as before: on the GLCD board
// the matrix becomes the console only
// when STARTUP.CMD has put GLCD.SVC
// in, a second or two after reset.

/** A tenth of a second at the page's 4 MHz. */
export const HOLD_CYCLES = 400_000;

/** True once M's startup is over: STARTUP.CMD has run, or there was none to run. */
function started(m) {
  const pos = m.symbols.get("STPOS");
  return pos === undefined || (m.read(pos) & 0x80) !== 0;
}

/** Move M's key queue on by one step. */
export function pumpKeys(m, hold = HOLD_CYCLES) {
  const head = m.pending?.[0];
  if (head?.letGo !== undefined) {
    if (m.cycles - head.letGo >= hold) m.pending.shift();
    return;
  }
  if (head?.via === "matrix" && head.down && started(m) && !m.videoConsole()) {
    head.heldFrom ??= m.cycles;
    if (m.cycles - head.heldFrom >= hold) {
      if (!head.up) {
        m.tec1g.applyMatrixKey(head.combo.row, head.combo.col, false);
        if (head.mod !== undefined) m.tec1g.applyMatrixKey(0, head.mod, false);
      }
      head.letGo = m.cycles;
      return;
    }
  }
  m.pumpInput();
}
