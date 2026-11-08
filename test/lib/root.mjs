// Locate the viewer and resolve runtime,
// esbuild and Playwright dependencies
// from the TEC-OS submodule.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const fromTecos = createRequire(resolve(ROOT, "tec-os/package.json"));
