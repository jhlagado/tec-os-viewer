// Decide whether a file copied onto or
// off the card is CP/M text. Text goes
// on with LF turned into CRLF and the
// last record padded with ^Z, and comes
// off at the first ^Z with CRLF turned
// back into LF. Anything else is copied
// byte for byte.

/** Types that are always text. */
export const TEXT_TYPES = new Set(["ASM", "BAS", "Z80", "TXT", "INC", "MAC", "LST", "DOC", "MD", "CMD", "SUB"]);
/** Types that are never text, whatever their bytes. */
export const RAW_TYPES = new Set(["COM", "SVC", "RTL", "BIN"]);

const EOF = 0x1a;

/** NAME's type, in upper case, or "" when it has none. */
export function fileType(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toUpperCase();
}

/**
 * Whether BYTES look like text: at least
 * one byte, each printable ASCII, TAB,
 * CR or LF.
 */
export function looksText(bytes) {
  if (!bytes.length) return false;
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) continue;
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    return false;
  }
  return true;
}

/**
 * Whether a file from the PC, named NAME
 * with BYTES, goes on the card as text:
 * by its type when it names one, else by
 * its bytes.
 */
export function isText(name, bytes) {
  const type = fileType(name);
  if (RAW_TYPES.has(type)) return false;
  if (TEXT_TYPES.has(type)) return true;
  return looksText(bytes);
}

/**
 * Whether a file on the card, named NAME
 * with its whole records BYTES, comes
 * off as text. Only the bytes before
 * its first ^Z count, less any 00h
 * padding at the end.
 */
export function isCardText(name, bytes) {
  const at = bytes.indexOf(EOF);
  let end = at < 0 ? bytes.length : at;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return isText(name, bytes.subarray(0, end));
}

/** Text read off the card, less any 00h padding left after it. */
export function trimPadding(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.subarray(0, end);
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
