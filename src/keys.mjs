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
// after the ROM has taken SHELL.SVC.
// Startup is over at the first console
// read that waits for a key, once the
// ROM has taken STARTUP.CMD's first
// line (STPOS 80h): at the first
// prompt, or in a program that
// STARTUP.CMD starts and that waits
// for a key. Nothing waits for a key
// while the ROM reads STARTUP.CMD or
// a service installs. A status poll
// doesn't count: the ROM polls before
// GLCD.SVC is in. The mark is cleared
// when the CPU reaches COLD, as a reset
// or a program's cold boot does, when
// the page resets the machine, and when
// a key is checked with STPOS below
// 80h. The hold starts again whenever
// the key would wait.
//
// A startup program that only polls,
// such as DEMO run from STARTUP.CMD
// under CON TTY, never marks startup
// over. So on CON TTY or CON BAT a key
// still waiting for startup is let go
// after STARTUP_CYCLES. By then the
// GLCD board has long had UC1: as its
// console.
//
// While a program has EXPAND 1 in the
// 8000h-BFFFh window, TEC-OS's own
// bytes there can't be read, so a key
// that is down waits, neither let go
// nor handed to the machine's own
// queue, which reads KBLAST there. A
// hold already started runs on.

/** A tenth of a second at the page's 4 MHz. */
export const HOLD_CYCLES = 400_000;

/** Ten seconds at the page's 4 MHz. */
export const STARTUP_CYCLES = 40_000_000;

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

/** TEC-OS's console reads that wait for a key: serial, then the matrix. */
const READS = [["CINLP", "CINWE"], ["CINMX", "CINME"]];

/**
 * Mark M's startup over once its CPU is
 * in a waiting console read with STPOS
 * at 80h or above, and forget it at
 * COLD. Call it after each step.
 */
function noteStart(m) {
  m.keyCold ??= m.symbols.get("COLD") ?? -1;
  if (m.keyGate) {
    if (m.pc === m.keyCold) m.keyGate = false;
    return;
  }
  const pos = m.symbols.get("STPOS");
  if (pos === undefined) {
    m.keyGate = true;
    return;
  }
  if (m.sysCtrl & 0x04 || m.read(pos) < 0x80) return;
  m.keyReads ??= READS.filter((r) => r.every((n) => m.symbols.has(n))).map((r) => r.map((n) => m.sym(n)));
  const pc = m.pc;
  m.keyGate = m.keyReads.some(([from, to]) => pc >= from && pc < to);
}

/** Forget M's startup mark, as at a reset. */
export function resetKeys(m) {
  m.keyGate = false;
}

/** True once M's startup is over. */
function started(m) {
  const pos = m.symbols.get("STPOS");
  if (pos !== undefined && m.read(pos) < 0x80) m.keyGate = false;
  return m.keyGate === true;
}

/**
 * Move M's key queue on by one step.
 * Call it after each step, so that the
 * startup mark doesn't depend on when
 * keys arrive. HOLD and STARTUPHOLD are
 * the two bounds, in cycles.
 */
export function pumpKeys(m, hold = HOLD_CYCLES, startupHold = STARTUP_CYCLES) {
  noteStart(m);
  const head = m.pending?.[0];
  if (!head) return;
  if (head.letGo !== undefined) {
    if (m.cycles - head.letGo >= hold) m.pending.shift();
    return;
  }
  if (head.via === "matrix" && head.down) {
    if (m.sysCtrl & 0x04) return;
    let due = false;
    if (m.videoConsole()) {
      delete head.heldFrom;
      delete head.waitFrom;
    } else if (!started(m)) {
      delete head.heldFrom;
      head.waitFrom ??= m.cycles;
      due = m.cycles - head.waitFrom >= startupHold;
    } else {
      delete head.waitFrom;
      head.heldFrom ??= m.cycles;
      due = m.cycles - head.heldFrom >= hold;
    }
    if (due) {
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
