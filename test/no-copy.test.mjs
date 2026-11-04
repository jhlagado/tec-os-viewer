// VG7: the viewer holds no copy of TEC-OS. No file outside tec-os/, tracked or
// waiting to be, has the content of a file TEC-OS tracks at its pin. Files are
// compared by their git blob ids.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/root.mjs";

const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

test("no file in the viewer outside tec-os/ is a file TEC-OS tracks at its pin", () => {
  const pinned = new Map();
  for (const line of git("-C", "tec-os", "ls-tree", "-r", "HEAD").split("\n").filter(Boolean)) {
    const [, , blob, path] = line.match(/^(\d+) (\w+) (\w+)\t(.*)$/).slice(1);
    pinned.set(blob, path);
  }
  const ours = git("ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((p) => p && p !== "tec-os" && !p.startsWith("tec-os/"));
  const blobs = git("hash-object", "--", ...ours).split("\n");
  const copies = ours.flatMap((p, i) => (pinned.has(blobs[i]) ? [`${p} is tec-os/${pinned.get(blobs[i])}`] : []));
  assert.deepEqual(copies, [], `copies of TEC-OS's files:\n${copies.join("\n")}`);
});
