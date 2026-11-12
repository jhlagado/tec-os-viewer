// The page's keys: what a browser key
// sends, and how the queued keys reach
// the machine.
//
// The machine holds a matrix key down
// until TEC-OS's own scan has read it.
// TEC-OS scans the matrix only while
// CON: is CRT: or UC1:, so under CON
// TTY or CON BAT that scan never comes:
// a key that nothing else reads would
// stay down and every later key would
// wait behind it. So on those consoles
// a matrix key is held for HOLD_CYCLES
// on end and then let go. That also
// ends the wait for a key that was
// read but whose release nothing sees:
// a MON-3 program's scan records its
// keys in TEC-OS's KBLAST, and once the
// program ends nothing scans to clear
// it. The next key waits as long again
// with no key down, so two keys never
// go down back to back for a program
// that reads the matrix itself.
//
// Until TEC-OS's startup is over a key
// waits as before: on the GLCD board
// the matrix becomes the console only
// when STARTUP.CMD's GLCD.SVC line has
// run, and the shell runs that line
// after the ROM has taken SHELL.SVC. A
// program that STARTUP.CMD starts runs
// before startup is over, so its keys
// wait for TEC-OS's scan too. The hold
// starts again whenever the key would
// wait, so the short spells while the
// ROM reads STARTUP.CMD don't add up
// to a let-go.
//
// TEC-OS's bytes are read only while
// its own RAM is in the 8000h-BFFFh
// window: a program that switches in
// EXPAND 1 there shows other bytes at
// the same addresses.

/** A tenth of a second at the page's 4 MHz. */
export const HOLD_CYCLES = 400_000;

const ARROWS = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D" };

/**
 * The matrix's own arrow keys, which
 * TEC-OS turns into ESC [ A to D.
 */
export const MATRIX_ARROWS = { ArrowUp: "\x03", ArrowDown: "\x04", ArrowLeft: "\x05", ArrowRight: "\x06" };

/** The text a browser key event E sends, or null for none. */
export function keyText(e) {
  if (e.metaKey || e.altKey) return null;
  if (e.key === "Enter") return "\r";
  if (e.key === "Backspace") return "\b";
  if (e.key === "Escape") return "\x1b";
  if (e.key === "Tab") return "\t";
  if (e.key === "Delete") return "\x7f";
  if (ARROWS[e.key]) return `\x1b[${ARROWS[e.key]}`;
  if (e.key.length !== 1) return null;
  if (e.ctrlKey) {
    const c = e.key.toUpperCase().charCodeAt(0);
    return c >= 0x40 && c <= 0x5f ? String.fromCharCode(c - 0x40) : null;
  }
  return e.key;
}

/**
 * What key event E queues: its text and
 * route, or null for nothing. On the
 * matrix an arrow is the matrix's arrow
 * key, and any other single key a
 * matrix key; the rest goes by serial.
 */
export function keyInput(e, matrix) {
  let text = keyText(e);
  if (text === null) return null;
  if (matrix && MATRIX_ARROWS[e.key]) text = MATRIX_ARROWS[e.key];
  return { text, via: matrix && text.length === 1 ? "matrix" : "serial" };
}

/**
 * True once M's startup is over: the
 * line being run was typed, or M waits
 * at a prompt with STARTUP.CMD done.
 * STFLAG is FFh while a line of
 * STARTUP.CMD runs, and stays so at the
 * first prompt after it, until a line
 * is typed there.
 */
function started(m) {
  const [pos, flag] = ["STPOS", "STFLAG"].map((n) => m.symbols.get(n));
  if (pos === undefined) return true;
  if (m.read(pos) < 0x80) return false;
  return flag === undefined || m.read(flag) === 0 || m.ready();
}

/** Move M's key queue on by one step. */
export function pumpKeys(m, hold = HOLD_CYCLES) {
  const head = m.pending?.[0];
  if (head?.letGo !== undefined) {
    if (m.cycles - head.letGo >= hold) m.pending.shift();
    return;
  }
  if (head?.via === "matrix" && head.down && !(m.sysCtrl & 0x04)) {
    if (!started(m) || m.videoConsole()) delete head.heldFrom;
    else {
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
  }
  m.pumpInput();
}
