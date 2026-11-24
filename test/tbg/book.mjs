// The TBG book's examples, from the TEC-OS checkout's documentation.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../lib/root.mjs";

/** The first asm block of the TBG book's chapter FILE, as a CP/M text file. */
export function bookSource(file) {
  const page = readFileSync(resolve(ROOT, "tec-os/documentation/content/tbg", file), "utf8");
  const source = page.match(/```asm\n([\s\S]+?)```/)?.[1];
  if (!source) throw new Error(`the TBG book's ${file} has no asm example`);
  return Buffer.from(source.replaceAll("\n", "\r\n") + "\x1a");
}
