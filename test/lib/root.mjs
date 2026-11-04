// The viewer's root, for the tests that read its page, build it or serve dist/,
// and a require that resolves from tec-os/, where esbuild and Playwright are
// installed with the runtime.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const fromTecos = createRequire(resolve(ROOT, "tec-os/package.json"));
