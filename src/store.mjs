// Persist the card image in IndexedDB
// across page reloads.
// loadCard returns null for no record
// and throws on read failure.
// saveCard throws on failure so the
// caller can report unsaved data and
// retry.

const DB = globalThis.document?.documentElement.dataset.cardNamespace ?? "tecos";
const STORE = "cards";
const KEY = "current";

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let warned = false;
function warn(e) {
  if (!warned) console.warn("card storage unavailable:", e);
  warned = true;
}

export async function loadCard() {
  let db;
  try {
    db = await open();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result ? new Uint8Array(request.result) : null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    warn(e);
    throw e;
  } finally {
    db?.close();
  }
}

export async function saveCard(image, { owned = false } = {}) {
  // Snapshot before database open can yield. The coordinator can transfer
  // its already-owned snapshot without allocating a second card copy.
  const snapshot = owned ? image : new Uint8Array(image);
  let db;
  try {
    db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot.byteOffset === 0 && snapshot.byteLength === snapshot.buffer.byteLength
        ? snapshot.buffer : new Uint8Array(snapshot).buffer, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("the save was aborted"));
    });
  } catch (e) {
    warn(e);
    throw e;
  } finally {
    db?.close(); // Close this save's connection.
  }
}
