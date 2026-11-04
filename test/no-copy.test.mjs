// VG7 and VG8: the viewer holds no copy of TEC-OS. VG7: no file outside
// tec-os/, tracked or waiting to be, has the content of a file TEC-OS tracks at
// its pin. VG8 (VD-9) is the same but for the files TEC-OS tracks under web/,
// the page's own, which it keeps until it removes them. Files are compared by
// their git blob ids.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/root.mjs";

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

/** Each file of the viewer's, outside tec-os/, that is a file TEC-OS tracks at its pin and KEEP takes. */
function copies(keep = () => true) {
  const pinned = new Map();
  for (const line of git("-C", "tec-os", "ls-tree", "-r", "HEAD").split("\n").filter(Boolean)) {
    const [, , blob, path] = line.match(/^(\d+) (\w+) (\w+)\t(.*)$/).slice(1);
    if (keep(path)) pinned.set(blob, path);
  }
  const ours = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((p) => p && p !== "tec-os" && !p.startsWith("tec-os/"));
  const blobs = git("hash-object", "--", ...ours).split("\n");
  return ours.flatMap((p, i) => (pinned.has(blobs[i]) ? [`${p} is tec-os/${pinned.get(blobs[i])}`] : []));
}

test("VG7: no file in the viewer outside tec-os/ is a file TEC-OS tracks at its pin", () => {
  const found = copies();
  assert.deepEqual(found, [], `copies of TEC-OS's files:\n${found.join("\n")}`);
});

test("VG8: no file in the viewer outside tec-os/ is a file TEC-OS tracks outside web/ at its pin", () => {
  const found = copies((path) => !path.startsWith("web/"));
  assert.deepEqual(found, [], `copies of TEC-OS's files:\n${found.join("\n")}`);
});
