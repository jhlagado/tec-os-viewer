// Locate the viewer and resolve runtime,
// esbuild and Playwright dependencies
// from the Tecos submodule.

import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requireTecos = createRequire(resolve(ROOT, "tec-os/package.json"));

// Chromium in fewer processes, so a browser test stays well inside the strict
// runs' memory guard, which adds up every process in the tree: no zygotes, and
// the GPU and network services in the browser process rather than their own.
// The page renders and fetches as before; only the process layout changes. One
// page measured 524 MB in seven processes without these and 346 MB in three.
export const LEAN_CHROMIUM = ["--no-zygote", "--in-process-gpu", "--enable-features=NetworkServiceInProcess2"];

let configuredBrowser = false;
export function fromTecos(name) {
  const module = requireTecos(name);
  if (name === "playwright" && !configuredBrowser) {
    const launch = module.chromium.launch.bind(module.chromium);
    // A cloud runner may provide Chromium while refusing Playwright's browser
    // download, so TEST_CHROMIUM, when set, names the executable. No page
    // behavior or test assertion is replaced.
    module.chromium.launch = (options = {}) => launch({
      ...(process.env.TEST_CHROMIUM ? { executablePath: process.env.TEST_CHROMIUM } : {}),
      ...options,
      args: [...LEAN_CHROMIUM, ...(options.args ?? [])],
    });
    configuredBrowser = true;
  }
  return module;
}
