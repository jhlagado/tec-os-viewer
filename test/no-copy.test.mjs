// VG8 (VD-9): reject copies of pinned
// TEC-OS files outside the submodule.
// Compare tracked and untracked viewer
// files by Git blob identity. Exclude
// TEC-OS's historical web/ sources.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/root.mjs";

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

/**
 * List viewer files matching pinned
 * TEC-OS blobs selected by keep.
 */
function copies(keep) {
  const pinned = new Map();
  for (const line of git("-C", "tec-os", "ls-tree", "-r", "HEAD").split("\n").filter(Boolean)) {
    const [, , blob, path] = line.match(/^(\d+) (\w+) (\w+)\t(.*)$/).slice(1);
    if (keep(path)) pinned.set(blob, path);
  }
  const ours = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((p) => p && p !== "tec-os" && !p.startsWith("tec-os/"));
  const blobs = git("hash-object", "--", ...ours).split("\n");
  return ours.flatMap((p, i) => (pinned.has(blobs[i]) ? [`${p} is tec-os/${pinned.get(blobs[i])}`] : []));
}

test("VG8: no file in the viewer outside tec-os/ is a file TEC-OS tracks outside web/ at its pin", () => {
  const found = copies((path) => !path.startsWith("web/"));
  assert.deepEqual(found, [], `copies of TEC-OS's files:\n${found.join("\n")}`);
});
