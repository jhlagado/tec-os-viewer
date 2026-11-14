// Exercise the actual IndexedDB adapter at open/put/transaction boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCard } from '../src/store.mjs';
const tick = () => new Promise(r => setImmediate(r));
function database(where = null) {
  let request, closes = 0; const buffers = [], tx = {}, putRequest = {};
  const db = {
    close() { closes++; },
    transaction() {
      if (where === 'transaction') throw Error('transaction refused');
      tx.objectStore = () => ({ put(buffer) {
        if (where === 'put') throw Error('put refused');
        buffers.push(new Uint8Array(buffer).slice()); return putRequest;
      } }); return tx;
    },
  };
  globalThis.indexedDB = { open() { if (where === 'open') throw Error('open refused'); request = {}; return request; } };
  return { tx, putRequest, buffers, open() { request.result = db; request.onsuccess(); }, get closes() { return closes; } };
}
async function muted(fn) {
  const warn = console.warn; console.warn = () => {};
  try { await fn(); } finally { console.warn = warn; delete globalThis.indexedDB; }
}

test('real store snapshots before delayed open, and only transaction completion resolves saving', async () => muted(async () => {
  const db = database(), image = Uint8Array.of(1, 2); let settled = false;
  const saving = saveCard(image).then(() => { settled = true; });
  image[0] = 9; db.open(); await tick();
  assert.deepEqual([...db.buffers[0]], [1, 2]); assert.equal(settled, false);
  db.putRequest.onsuccess?.(); await tick(); assert.equal(settled, false, 'put success alone is not a saved transaction');
  db.tx.oncomplete(); await saving; assert.equal(settled, true); assert.equal(db.closes, 1);
}));

test('a successful put followed by transaction abort rejects and closes the actual connection', async () => muted(async () => {
  const db = database(); const saving = saveCard(Uint8Array.of(3)); const refused = assert.rejects(saving, /aborted/);
  db.open(); await tick(); assert.deepEqual([...db.buffers[0]], [3]); db.putRequest.onsuccess?.();
  db.tx.onabort(); await refused; assert.equal(db.closes, 1);
}));

test('owned subarray storage excludes unrelated backing-buffer bytes', async () => muted(async () => {
  const db = database(), backing = Uint8Array.of(99, 4, 5, 88);
  const saving = saveCard(backing.subarray(1, 3), { owned: true }); db.open(); await tick();
  assert.deepEqual([...db.buffers[0]], [4, 5]); db.tx.oncomplete(); await saving; assert.equal(db.closes, 1);
}));

test('synchronous open, transaction and put exceptions reject without a false completion', async () => muted(async () => {
  for (const where of ['open', 'transaction', 'put']) {
    const db = database(where), saving = saveCard(Uint8Array.of(6));
    const refused = assert.rejects(saving, new RegExp(`${where} refused`));
    if (where !== 'open') db.open();
    await refused; assert.equal(db.closes, where === 'open' ? 0 : 1);
  }
}));

test('transaction error rejects the real adapter even if bytes were put', async () => muted(async () => {
  const db = database(); const saving = saveCard(Uint8Array.of(7)); const refused = assert.rejects(saving, /quota/);
  db.open(); await tick(); db.tx.error = Error('quota'); db.tx.onerror(); await refused; assert.equal(db.closes, 1);
}));
