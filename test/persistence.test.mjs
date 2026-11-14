import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Persistence } from '../src/persistence.mjs';
const gate = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };
const tick = () => new Promise(r => setImmediate(r));

test('snapshot is taken at writer admission, before asynchronous storage open', async () => {
  const blocked = gate(), opened = gate(); const stored = [];
  const p = new Persistence({ write: async image => { await opened.promise; stored.push([...image]); } });
  const image = Uint8Array.of(1); p.adopt(image);
  const barrier = p.exclusive(() => blocked.promise);
  const saving = p.autosave(); image[0] = 2; p.dirty();
  blocked.release(); await barrier; await tick();
  image[0] = 3; p.dirty(); opened.release(); await saving;
  assert.deepEqual(stored, [[2]]); assert.equal(p.status().saved, false);
  await p.autosave(); assert.deepEqual(stored, [[2], [3]]); assert.equal(p.status().saved, true);
});

test('blocked autosave retains one snapshot and coalesces latest intent', async () => {
  const first = gate(); const writes = [];
  const p = new Persistence({ write: async image => { writes.push([...image]); if (writes.length === 1) await first.promise; } });
  const image = Uint8Array.of(1); p.adopt(image);
  const saving = p.autosave(); await tick();
  for (let i = 2; i <= 20; i++) { image[0] = i; p.dirty(); assert.equal(p.autosave(), saving); }
  assert.deepEqual(writes, [[1]]); first.release(); await saving;
  assert.deepEqual(writes, [[1], [20]]); assert.equal(p.status().saved, true);
});

test('staged commit publishes before a queued autosave can overwrite it', async () => {
  const held = gate(); const writes = [];
  const p = new Persistence({ write: async image => { writes.push([...image]); if (image[0] === 2) await held.promise; } });
  const image = Uint8Array.of(1); p.adopt(image, { stored: true }); p.beginLifecycle();
  const commit = p.commit(Uint8Array.of(2)); await tick();
  const saving = p.autosave(); assert.equal(image[0], 1); assert.equal(p.status().saved, false);
  held.release(); await Promise.all([commit, saving]); p.endLifecycle();
  assert.deepEqual(writes, [[2]]); assert.equal(image[0], 2); assert.equal(p.status().saved, true);
});

test('failed commit preserves bytes; retries keep the failure until current transaction completes', async () => {
  const held = gate(); let fail = true;
  const p = new Persistence({ write: async () => { if (fail) throw Error('quota'); await held.promise; } });
  const image = Uint8Array.of(1); p.adopt(image, { stored: true });
  await assert.rejects(p.commit(Uint8Array.of(2)), /quota/);
  assert.deepEqual([...image], [1]); assert.equal(p.failure, 'quota');
  image[0] = 3; p.dirty(); fail = false; const saving = p.autosave(); await tick();
  assert.equal(p.failure, 'quota'); assert.equal(p.status().saved, false);
  held.release(); await saving; assert.equal(p.failure, null); assert.equal(p.status().saved, true);
});

test('read protection survives replacement and suppresses every writer', async () => {
  let writes = 0;
  const p = new Persistence({ write: async () => { writes++; }, protectedRecord: true });
  p.adopt(Uint8Array.of(1)); await p.autosave();
  await p.commit(Uint8Array.of(2), { replace: true }); await p.commit(Uint8Array.of(3)); await p.autosave();
  assert.equal(writes, 0); assert.deepEqual([...p.image], [3]); assert.equal(p.status().protectedRecord, true); assert.equal(p.status().saved, false);
});

test('old machine image callbacks cannot dirty replacement epochs', async () => {
  const p = new Persistence({ write: async () => {} });
  const old = Uint8Array.of(1); p.adopt(old);
  await p.commit(Uint8Array.of(2), { replace: true });
  const token = p.token(); assert.equal(p.dirty(old), false); assert.deepEqual(p.token(), token);
});

test('render exceptions before and after transaction completion cannot split commit from publication', async () => {
  const writes = [];
  const p = new Persistence({ write: async bytes => writes.push([...bytes]), changed: () => { throw Error('render failed'); } });
  const image = Uint8Array.of(1); p.adopt(image, { stored: true });
  const commit = p.commit(Uint8Array.of(2));
  const save = p.autosave(); await Promise.all([commit, save]);
  assert.deepEqual(writes, [[2]]); assert.deepEqual([...image], [2]);
  assert.equal(p.inFlight, null); assert.equal(p.status().saved, true);
  assert.match(p.notificationFailure.message, /render failed/);
});

test('a failed replacement remains a browser failure until a matching retry completes', async () => {
  let fail = true;
  const p = new Persistence({ write: async () => { if (fail) throw Error('replacement quota'); } });
  const old = Uint8Array.of(1); p.adopt(old, { stored: true });
  await assert.rejects(p.commit(Uint8Array.of(2), { replace: true }), /replacement quota/);
  assert.equal(p.image, old); assert.equal(p.failure, 'replacement quota'); assert.equal(p.failures, 1); assert.equal(p.status().saved, false);
  fail = false; await p.commit(Uint8Array.of(2), { replace: true });
  assert.equal(p.failure, null); assert.equal(p.status().saved, true);
});

test('malformed staging is rejected before storage and postpublication errors cannot roll bytes back', async () => {
  const writes = []; const p = new Persistence({ write: async bytes => writes.push([...bytes]) });
  const image = Uint8Array.of(1); p.adopt(image, { stored: true });
  await assert.rejects(p.commit(Uint8Array.of(2, 3)), /invalid staged/);
  await assert.rejects(p.commit([2]), /invalid staged/);
  assert.deepEqual(writes, []); assert.deepEqual([...image], [1]);
  await assert.rejects(p.commit(Uint8Array.of(2), { publish: () => { throw Error('publication observer failed'); } }), error => error.published === true);
  await p.autosave(); assert.deepEqual(writes, [[2]]); assert.deepEqual([...image], [2]); assert.equal(p.status().saved, true);
});

test('same-array callbacks from an earlier image epoch cannot dirty the current token', () => {
  const p = new Persistence({ write: async () => {} }); const image = Uint8Array.of(1);
  p.adopt(image); const old = p.epoch; p.adopt(image, { stored: true });
  assert.equal(p.dirty(image, old), false); assert.equal(p.status().saved, true);
});

test('autosave retries a failed replacement even when the unchanged active token was previously stored', async () => {
  const held = gate(); let writes = 0;
  const p = new Persistence({ write: async () => { if (++writes === 1) throw Error('quota'); await held.promise; } });
  p.adopt(Uint8Array.of(1), { stored: true });
  await assert.rejects(p.commit(Uint8Array.of(2), { replace: true }), /quota/);
  const retry = p.autosave(); await tick(); assert.equal(writes, 2); assert.equal(p.status().saved, false); assert.equal(p.failure, 'quota');
  held.release(); await retry; assert.deepEqual([...p.image], [1]); assert.equal(p.failure, null); assert.equal(p.status().saved, true);
});

test('primitive or frozen postpublication errors retain an explicit committed marker', async () => {
  for (const thrown of ['failure', Object.freeze(new Error('frozen'))]) {
    const p = new Persistence({ write: async () => {} }); p.adopt(Uint8Array.of(1));
    await assert.rejects(p.commit(Uint8Array.of(2), { publish: () => { throw thrown; } }), error => error.published === true && error.cause === thrown);
    assert.deepEqual([...p.image], [2]); assert.equal(p.status().saved, true);
  }
});
