// Decide whether a file copied onto or
// off the card is CP/M text. Text goes
// on with LF turned into CRLF and the
// last record padded with ^Z, and comes
// off at its end with CRLF turned back
// into LF. Anything else is copied byte
// for byte. A file is taken as text only
// when its bytes are all text, so few
// binaries, and only short ones, can
// pass for text.

/** Types that are text when their bytes allow it. */
export const TEXT_TYPES = new Set(["ASM", "BAS", "Z80", "TXT", "INC", "MAC", "LST", "DOC", "MD", "CMD", "SUB", "PRN", "ASC", "LIB", "HEX", "ME", "H", "C"]);
/** Types that are never text, whatever their bytes. */
export const RAW_TYPES = new Set(["COM", "SVC", "RTL", "BIN"]);

const EOF = 0x1a;
const RECORD = 128;

/** NAME's type, in upper case, or "" when it has none. */
export function fileType(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toUpperCase();
}

/**
 * Whether BYTES can be text: at least
 * one byte, and each printable ASCII,
 * TAB, LF, FF or CR, or, with HIGH, any
 * byte from 80h, as UTF-8 and code
 * pages use. A single ^Z may end it.
 * 00h, ESC and the other control bytes
 * mark a binary.
 */
export function looksText(bytes, high = false) {
  const end = bytes.length && bytes[bytes.length - 1] === EOF ? bytes.length - 1 : bytes.length;
  if (!end) return false;
  for (let i = 0; i < end; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b <= 0x7e) continue;
    if (b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d) continue;
    if (high && b >= 0x80) continue;
    return false;
  }
  return true;
}

/**
 * Whether a file from the PC, named NAME
 * with BYTES, goes on the card as text.
 * A text type may hold bytes from 80h;
 * a file of any other type must be
 * plain ASCII, since a short binary can
 * avoid the control bytes by chance.
 */
export function isText(name, bytes) {
  const type = fileType(name);
  if (RAW_TYPES.has(type)) return false;
  return looksText(bytes, TEXT_TYPES.has(type));
}

/**
 * The text in a file on the card, its
 * whole records BYTES: the bytes before
 * its first ^Z when only ^Z and 00h
 * follow it, else the bytes before 00h
 * padding within the last record. Null
 * when neither holds, as when data
 * follows a ^Z or a whole record is 00h.
 */
export function cardText(bytes) {
  const at = bytes.indexOf(EOF);
  if (at >= 0) {
    for (let i = at + 1; i < bytes.length; i++) if (bytes[i] !== EOF && bytes[i] !== 0) return null;
    return bytes.subarray(0, at);
  }
  const floor = Math.max(0, bytes.length - RECORD);
  let end = bytes.length;
  while (end > floor && bytes[end - 1] === 0) end--;
  if (end === floor && bytes.length) return null;
  return bytes.subarray(0, end);
}

/**
 * Whether a file on the card, named NAME
 * with its whole records BYTES, comes
 * off as text: its text, as cardText
 * finds it, passes isText.
 */
export function isCardText(name, bytes) {
  const text = cardText(bytes);
  return text !== null && isText(name, text);
}

/**
 * Text or not under the page's MODE:
 * "text" and "raw" force it, "auto"
 * leaves it to DECIDE(NAME, BYTES).
 */
export function chooseText(mode, name, bytes, decide = isText) {
  if (mode === "text") return true;
  if (mode === "raw") return false;
  return decide(name, bytes);
}

/**
 * The bytes a file on the card, named
 * NAME with its whole records BYTES,
 * comes off as under MODE: as text, its
 * text with CRLF turned into LF, else
 * every byte. Forced text with no end
 * cardText can find keeps every byte
 * but turns CRLF into LF.
 */
export function fromCard(mode, name, bytes) {
  if (!chooseText(mode, name, bytes, isCardText)) return bytes;
  const text = cardText(bytes) ?? bytes;
  let latin1 = "";
  for (const b of text) latin1 += String.fromCharCode(b);
  return Uint8Array.from(latin1.replace(/\r\n/g, "\n"), (c) => c.charCodeAt(0));
}
