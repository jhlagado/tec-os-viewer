// Serve dist/ on a free local port.
// Open a page with a stored card and
// selected display preferences.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { ROOT } from "./root.mjs";

const DIST = resolve(ROOT, "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

/**
 * Serve dist/ at 127.0.0.1 on the port
 * returned by server.address().port.
 */
export function serve({ seedImage = null } = {}) {
  const server = createServer(async (req, res) => {
    if (req.url === "/__test_setup__") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>Test setup</title>");
      return;
    }
    if (req.url === "/planted.img" && seedImage) {
      const body = Buffer.from(seedImage.buffer, seedImage.byteOffset, seedImage.byteLength);
      seedImage = null;
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": body.length, "cache-control": "no-store" });
      res.end(body);
      return;
    }
    const path = resolve(DIST, `.${decodeURIComponent(new URL(req.url, "http://x").pathname)}`);
    const file = path === DIST || path.endsWith(sep) ? resolve(path, "index.html") : path;
    try {
      if (!file.startsWith(DIST + sep)) throw new Error("outside");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/**
 * Plant the card and display/width
 * preferences before opening the app
 * at the same origin. SETUP, if given,
 * gets the browser context just before
 * the app opens.
 */
export async function open(browser, url, image, display, width, { setup, reuseSetupPage = false, serverSeed = false } = {}) {
  const context = await browser.newContext();
  const plantedUrl = `${url}planted.img`;
  const plant = (route) => route.fulfill({ status: 200, body: reuseSetupPage
    ? Buffer.from(image.buffer, image.byteOffset, image.byteLength) : Buffer.from(image) });
  if (!serverSeed) await context.route(plantedUrl, plant);
  const planter = await context.newPage();
  await planter.goto(`${url}__test_setup__`); // Set the origin without running the app.
  await planter.evaluate(
    async ([display, width]) => {
      localStorage.setItem("tecos.display", display);
      localStorage.setItem("tecos.width", width);
      const bytes = await fetch("planted.img").then((r) => r.arrayBuffer());
      await new Promise((ok) => {
        const r = indexedDB.open("tecos", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("cards");
        r.onsuccess = () => {
          const tx = r.result.transaction("cards", "readwrite");
          tx.objectStore("cards").put(bytes, "current");
          tx.oncomplete = () => (r.result.close(), ok());
        };
      });
    },
    [display, width],
  );
  if (reuseSetupPage) {
    if (!serverSeed) await context.unroute(plantedUrl, plant);
  } else await planter.close();
  if (setup) await setup(context);
  const page = reuseSetupPage ? planter : await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  return { context, page, errors };
}
