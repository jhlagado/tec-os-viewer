// dist/ served on a free local port, as a static host serves the page.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { ROOT } from "./root.mjs";

const DIST = resolve(ROOT, "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

/** A server for dist/; its URL is http://127.0.0.1:<server.address().port>/. */
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
