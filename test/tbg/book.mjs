// The TBUG book's examples. The book is jhlagado/tec-os-books, outside
// this repository, so its STEP.ASM is kept here as the book prints it:
// step.asm is the first asm block of content/tbug/02-watch-the-stack.md at
// tec-os-books 1896e6e. When the book's listing changes, copy it again.
import { readFileSync } from "node:fs";

const FILES = { "02-watch-the-stack.md": "step.asm" };

/** The first asm block of the TBUG book's chapter FILE, as a CP/M text file. */
export function bookSource(file) {
  if (!FILES[file]) throw new Error(`no copy of the TBUG book's ${file} example`);
  const source = readFileSync(new URL(FILES[file], import.meta.url), "utf8");
  return Buffer.from(source.replaceAll("\n", "\r\n") + "\x1a");
}
