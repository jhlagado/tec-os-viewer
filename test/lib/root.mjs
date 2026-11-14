// Locate the viewer and resolve runtime,
// esbuild and Playwright dependencies
// from the TEC-OS submodule.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requireTecos = createRequire(resolve(ROOT, "tec-os/package.json"));
let configuredBrowser = false;
export function fromTecos(name) {
  const module = requireTecos(name);
  // A cloud runner may provide Chromium while refusing Playwright's browser
  // download. This changes only the real executable used by browser tests;
  // no page behavior or test assertions are replaced. Default stays unchanged.
  if (name === "playwright" && process.env.TEST_CHROMIUM && !configuredBrowser) {
    const launch = module.chromium.launch.bind(module.chromium);
    module.chromium.launch = (options = {}) => launch({ executablePath: process.env.TEST_CHROMIUM, ...options });
    configuredBrowser = true;
  }
  return module;
}
