// Check the browser bundle for Node
// globals and duplicate runtime copies.
// Resolve the runtime from tec-os/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundleOptions } from "../tools/build.mjs";
import { fromTecos } from "./lib/root.mjs";

const { build } = fromTecos("esbuild");

const NODE_GLOBALS = ["Buffer", "process", "global", "require", "module", "__dirname", "__filename", "setImmediate", "clearImmediate"];

test("the web page's bundle stays within its size bound and uses no Node globals", async () => {
  const out = await build({ ...bundleOptions, sourcemap: "external", write: false, logLevel: "silent" });
  const js = out.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const found = NODE_GLOBALS.filter((name) => new RegExp(`(?<![.\\w$])${name}(?![\\w$])`).test(js));
  assert.deepEqual(found, [], `the bundle refers to ${found.join(", ")}`);
  const map = JSON.parse(out.outputFiles.find((f) => f.path.endsWith(".map")).text);
  const runtimes = new Set(map.sources.filter((s) => s.includes("debug80-runtime/")).map((s) => s.replace(/debug80-runtime\/.*/, "")));
  assert.deepEqual([...runtimes], ["../tec-os/node_modules/@jhlagado/"], "one runtime, from tec-os/");
  const criteria = JSON.parse(readFileSync(new URL('./fixtures/viewer-feedback-cost.json', import.meta.url)));
  const normalizedBytes = Buffer.byteLength(js.replace(/(?:^|\r?\n)\/\/# sourceMappingURL=app\.js\.map(?:\r?\n)?$/, '').trimEnd() + '\n');
  assert.ok(normalizedBytes <= criteria.baseline.normalizedEmbeddedModuleBytes + criteria.maximumAddedNormalizedModuleBytes,
    `normalized module is ${normalizedBytes} bytes`);
});
