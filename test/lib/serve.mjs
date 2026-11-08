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
export function serve() {
  const server = createServer(async (req, res) => {
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
 * at the same origin.
 */
export async function open(browser, url, image, display, width) {
  const context = await browser.newContext();
  await context.route(`${url}planted.img`, (route) => route.fulfill({ status: 200, body: Buffer.from(image) }));
  const planter = await context.newPage();
  await planter.goto(`${url}missing`); // Set the origin without running the app.
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
  await planter.close();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  return { context, page, errors };
}
