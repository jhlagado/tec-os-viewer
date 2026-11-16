// Check card-storage failures
// and recovery. Use src/store.mjs in
// Node with an IndexedDB stand-in.
// Inject Chromium failures before page
// startup. Check unsaved status and
// successful retry. Run npm run tecos
// before the browser tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ROOT, fromTecos } from "./lib/root.mjs";
import { pageHarness, gate, tick } from "./lib/lifecycle-page.mjs";
import { serve } from "./lib/serve.mjs";

let closes = 0;
/**
 * Simulate IndexedDB open/read failures
 * or a failed write transaction.
 */
function failing(where) {
  const later = (f) => setTimeout(f, 0);
  return {
    open() {
      const request = {};
      later(() => {
        if (where === "open") {
          request.error = new Error("open refused");
          request.onerror?.();
          return;
        }
        request.result = {
          close() {
            closes += 1;
          },
          transaction() {
            const tx = { error: null };
            const get = () => {
              const r = {};
              later(() => (where === "get" ? ((r.error = new Error("read failed")), r.onerror?.()) : ((r.result = undefined), r.onsuccess?.())));
              return r;
            };
            tx.objectStore = () => ({ get, put: () => later(() => ((tx.error = new Error("quota exceeded")), tx.onerror?.())) });
            return tx;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test("the real store's saveCard throws when IndexedDB can't open, or a put fails", async () => {
  const { saveCard } = await import(pathToFileURL(resolve(ROOT, "src/store.mjs")).href);
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const where of ["open", "put"]) {
      globalThis.indexedDB = failing(where);
      closes = 0;
      await assert.rejects(saveCard(new Uint8Array(4)), /open refused|quota exceeded/, where);
      assert.equal(closes, where === "open" ? 0 : 1, `${where}: a connection opened is closed`);
    }
  } finally {
    console.warn = warn;
    delete globalThis.indexedDB;
  }
});

test("the page keeps a card it couldn't save unsaved, says so, and saves it once storage works", async (t) => {
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Count write transactions and abort
  // them while window.failSaves is set.
  await page.addInitScript(() => {
    window.failSaves = true;
    window.saveTries = 0;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...a) => {
      const request = open(...a);
      request.addEventListener("success", () => {
        const db = request.result;
        const transaction = db.transaction.bind(db);
        db.transaction = (store, mode) => {
          const tx = transaction(store, mode);
          if (mode !== "readwrite") return tx;
          window.saveTries += 1;
          if (window.failSaves) setTimeout(() => tx.abort(), 0);
          return tx;
        };
      });
      return request;
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => /not saved/.test(document.getElementById("browserstatus").textContent), null, { timeout: 30_000 });
  await page.waitForFunction(() => window.saveTries >= 3, null, { timeout: 30_000 });
  await page.evaluate(() => (window.failSaves = false));
  await page.waitForFunction(() => !/not saved|keeps failing/.test(document.getElementById("browserstatus").textContent), null, { timeout: 30_000 });
  const stored = await page.evaluate(
    () =>
      new Promise((ok) => {
        const r = indexedDB.open("tecos", 1);
        r.onsuccess = () => {
          const get = r.result.transaction("cards").objectStore("cards").get("current");
          get.onsuccess = () => ok(get.result ? get.result.byteLength : 0);
        };
      }),
  );
  assert.ok(stored > 0, "the card saved once storage worked");
  assert.deepEqual(errors, []);
});

test("the page saves one card at a time, and after three failures says saving keeps failing", async () => {
  const held = gate(); let calls = 0, fail = false;
  const p = pageHarness(Uint8Array.of(1), { saveCard: async () => {
    calls++; if (fail) throw Error('quota exceeded'); await held.promise;
  } });
  p.persistence.dirty(); const first = p.timers[0](); await tick();
  p.state.card[0] = 2; p.persistence.dirty(); const second = p.timers[0]();
  assert.equal(calls, 1); held.release(); await Promise.all([first, second]);
  assert.equal(calls, 2); fail = true;
  for (let i = 1; i <= 3; i++) {
    p.persistence.dirty(); await p.timers[0]();
    assert.match(p.elements.browserstatus.textContent, i < 3 ? /not saved.*quota exceeded/ : /keeps failing.*Download image/);
  }
});

test("a file import during a timer's save saves after it, so the stored card holds the copied files", async () => {
  const held = gate(), writes = [];
  const p = pageHarness(Uint8Array.of(1), { saveCard: async bytes => {
    if (!writes.length) await held.promise; writes.push([...bytes]);
  } });
  p.persistence.dirty(); const timer = p.timers[0](); await tick();
  const staged = p.persistence.commit(Uint8Array.of(2));
  const queued = p.timers[0](); await tick(); assert.deepEqual(writes, []);
  held.release(); await Promise.all([timer, staged, queued]);
  assert.deepEqual(writes, [[1], [2]]); assert.deepEqual([...p.state.card], [2]);
  assert.match(readFileSync(resolve(ROOT, 'src/main.mjs'), 'utf8'), /await persistence.commit\(staged\)/, 'actual Copy handler uses the same commit barrier');
});

test("the real store's loadCard gives null for no card and throws when the read fails, so the page can tell them apart", async () => {
  const { loadCard } = await import(pathToFileURL(resolve(ROOT, "src/store.mjs")).href);
  const warn = console.warn;
  console.warn = () => {};
  try {
    globalThis.indexedDB = failing("none");
    assert.equal(await loadCard(), null, "no record: null");
    globalThis.indexedDB = failing("get");
    await assert.rejects(loadCard(), /read failed/, "a failed read throws");
  } finally {
    console.warn = warn;
    delete globalThis.indexedDB;
  }
});

test("a saved card that won't read, or won't parse, is left as it is: the page runs a starter unsaved and says so", async (t) => {
  execFileSync(process.execPath, [resolve(ROOT, "tools/build.mjs")], { stdio: "pipe" });
  const { chromium } = fromTecos("playwright");
  const server = await serve();
  t.after(() => {
    server.close();
  });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const url = `http://127.0.0.1:${server.address().port}/`;
  const MARK = [7, 7, 7, 1, 2, 3];
  const record = (page) => page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open("tecos", 1);
    r.onsuccess = () => {
      const get = r.result.transaction("cards").objectStore("cards").get("current");
      get.onsuccess = () => ok(get.result ? Array.from(new Uint8Array(get.result)).slice(0, 6) : null);
    };
  }));
  const plant = (page, bytes) => page.evaluate((b) => new Promise((ok) => {
    const r = indexedDB.open("tecos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("cards");
    r.onsuccess = () => {
      const tx = r.result.transaction("cards", "readwrite");
      tx.objectStore("cards").put(new Uint8Array(b).buffer, "current");
      tx.oncomplete = ok;
    };
  }), bytes);
  const context = await browser.newContext();
  for (const kind of ["read", "parse"]) {
    // Close the planting page before the
    // test page can load or save the card.
    const planter = await context.newPage();
    await planter.goto(`${url}__test_setup__`); // Set the origin without running the app.
    await plant(planter, kind === "read" ? [...MARK, ...new Array(512).fill(0)] : MARK);
    await planter.close();
    const page = await context.newPage();
    if (kind === "read")
      await page.addInitScript(() => {
        const get = IDBObjectStore.prototype.get;
        let failed = false;
        IDBObjectStore.prototype.get = function (...a) {
          if (failed) return get.apply(this, a);
          failed = true;
          const r = {};
          setTimeout(() => ((r.error = new Error("read failed")), r.onerror?.()), 0);
          return r;
        };
      });
    await page.goto(url);
    await page.waitForFunction(() => /could not be read/.test(document.getElementById("browserstatus").textContent), null, { timeout: 30_000 });
    await page.waitForTimeout(5_000); // Allow two autosave intervals.
    assert.deepEqual(await record(page), MARK, `${kind}: the stored record is untouched`);
    await page.close();
  }
});
