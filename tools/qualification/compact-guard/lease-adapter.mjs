// Opt-in experimental lease boundary. Import has no process/filesystem effects.
// No controller, valid lease or cleanup authority is supplied by this module.
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash, randomBytes, verify, createPublicKey } from 'node:crypto';
import { createConnection } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = '45e4edaee20eba1b2d8ec67983ed3acc06be31a64eb059e8bc4ad21257871374';
const ID = ['pid', 'birthSec', 'birthUsec', 'exe', 'exeSha256', 'pgid', 'sid'];
const now = () => process.hrtime.bigint();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const unknown = message => { throw new Error('registered launch unresolved: ' + message); };
const digest = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
const pid = n => Number.isSafeInteger(n) && n >= 2 && n <= 2147483647;
function identity(p) {
  if (!p || !pid(p.pid) || !pid(p.pgid) || !pid(p.sid) ||
      !Number.isSafeInteger(p.birthSec) || p.birthSec < 0 ||
      !Number.isSafeInteger(p.birthUsec) || p.birthUsec < 0 || p.birthUsec >= 1000000 ||
      typeof p.exe !== 'string' || !isAbsolute(p.exe) || !digest(p.exeSha256)) unknown('identity schema');
  return p;
}
function same(a, b) { return ID.every(k => a[k] === b[k]); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function remaining(deadline) {
  const ms = Number((deadline - now()) / 1000000n);
  if (ms <= 0) unknown('absolute deadline');
  return ms;
}
async function bounded(promise, deadline, capMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('registered launch inspection timeout; reservation held')), Math.min(capMs, remaining(deadline)));
    })]);
  } finally { clearTimeout(timer); }
}
async function bytes(path, limit, deadline) {
  if (!isAbsolute(path)) unknown('absolute sealed path required');
  const handle = await bounded(open(path, constants.O_RDONLY | constants.O_NOFOLLOW), deadline, 150);
  try {
    const before = await bounded(handle.stat(), deadline, 150);
    if (!before.isFile() || before.size > limit || before.size < 0) unknown('file type/size');
    const chunks = []; let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(65536);
      const result = await bounded(handle.read(buffer, 0, buffer.length, null), deadline, 150);
      if (!result.bytesRead) break;
      total += result.bytesRead;
      if (total > limit) unknown('file grew past bound');
      chunks.push(buffer.subarray(0, result.bytesRead));
    }
    const after = await bounded(handle.stat(), deadline, 150);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs || total !== before.size) unknown('file changed');
    return Buffer.concat(chunks, total);
  } finally { await bounded(handle.close(), deadline, 150); }
}
async function privatePath(path, type, deadline) {
  const st = await bounded(lstat(path), deadline, 150);
  if (st.uid !== process.getuid() || (st.mode & 0o077) || st.isSymbolicLink() ||
      !(type === 'directory' ? st.isDirectory() : type === 'socket' ? st.isSocket() : st.isFile())) unknown('non-private ' + type);
}
async function sealed(file, deadline, limit = 32 * 1024 * 1024) {
  if (!file || !digest(file.sha256)) unknown('file seal missing');
  const data = await bytes(file.path, limit, deadline);
  if (sha(data) !== file.sha256) unknown('file seal differs: ' + file.path);
  return data;
}

// Only a sealed, non-forking identity operation may use this reader. Timeout
// never signals a numeric PID: the probe remains owned by G and is reported
// to external controllers as unresolved. It is not treated as disappeared.
function probeIdentity(binary, target, deadline, pending) {
  if (!pid(target)) unknown('probe PID');
  const before = now();
  return new Promise((resolveProbe, reject) => {
    let child, timer, done = false, output = Buffer.alloc(0), errors = 0;
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer);
      if (error) {
        child?.stdout?.destroy(); child?.stderr?.destroy();
        reject(error);
      } else resolveProbe(value);
    };
    const budget = Math.min(150, remaining(deadline));
    timer = setTimeout(() => finish(new Error('identity probe timeout; owned group retained')), budget);
    try {
      child = spawn(binary, ['identity', String(target)], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
      if (child.pid) pending.add(child.pid);
      child.on('error', e => finish(e));
      child.stdout.on('data', b => {
        if (output.length + b.length > 65536) return finish(new Error('identity output limit'));
        output = Buffer.concat([output, b]);
      });
      child.stderr.on('data', b => { errors += b.length; if (errors > 65536) finish(new Error('identity stderr limit')); });
      child.on('close', code => {
        pending.delete(child.pid);
        if (done) return;
        if (code !== 0) return finish(new Error('identity probe failed'));
        try {
          const value = JSON.parse(output.toString('utf8'));
          if (value.state !== 'present') unknown('expected live identity absent');
          if (value.clockDomain !== 'darwin-mach-continuous-ns-node24.18' || !/^\d+$/.test(value.clockNs) ||
              BigInt(value.clockNs) < before - 100000n || BigInt(value.clockNs) > now() + 100000n) unknown('clock bracket mismatch');
          finish(null, identity(value));
        } catch (e) { finish(e); }
      });
    } catch (e) { finish(e); }
  });
}

async function ipc(socketPath, request, deadline) {
  await privatePath(socketPath, 'socket', deadline);
  const payload = Buffer.from(JSON.stringify(request) + '\n');
  if (payload.length > 65536) unknown('IPC request limit');
  return new Promise((resolveReply, reject) => {
    let socket, timer, done = false, received = Buffer.alloc(0);
    const finish = (error, value) => {
      if (done) return; done = true; clearTimeout(timer); socket?.destroy();
      if (error) reject(error); else resolveReply(value);
    };
    timer = setTimeout(() => finish(new Error('lease IPC timeout; reservation held')), Math.min(150, remaining(deadline)));
    try {
      socket = createConnection(socketPath);
      socket.on('error', error => finish(error));
      socket.on('connect', () => socket.end(payload));
      socket.on('data', b => {
        if (received.length + b.length > 262144) return finish(new Error('IPC response limit'));
        received = Buffer.concat([received, b]);
        const end = received.indexOf(10);
        if (end >= 0) {
          if (end !== received.length - 1) return finish(new Error('extra IPC record'));
          try { finish(null, JSON.parse(received.subarray(0, end).toString('utf8'))); }
          catch (e) { finish(e); }
        }
      });
      socket.on('end', () => { if (!done) finish(new Error('partial IPC reply')); });
    } catch (e) { finish(e); }
  });
}

export async function loadRegisteredLease({ leasePath, command, guardSource, adapterSource }) {
  // Local startup allowance begins before reading the lease. The external
  // cohort controller must already enforce T0 before this process executes.
  const startupDeadline = now() + 1000000000n;
  if (!isAbsolute(leasePath)) unknown('lease path required');
  await privatePath(dirname(leasePath), 'directory', startupDeadline);
  await privatePath(leasePath, 'file', startupDeadline);
  const leaseBytes = await bytes(leasePath, 262144, startupDeadline);
  const leaseSha256 = sha(leaseBytes);
  const lease = JSON.parse(leaseBytes.toString('utf8'));
  const testAuthority = process.env.P6_PROTOTYPE_TEST_AUTHORITY;
  const trustBytes = await bytes(testAuthority ?? fileURLToPath(new URL('./authority-root.json', import.meta.url)), 65536, startupDeadline);
  if (testAuthority && (!digest(process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256) || sha(trustBytes) !== process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256)) unknown('test trust source seal');
  const trust = JSON.parse(trustBytes.toString('utf8'));
  if (trust.version !== 1 || (testAuthority ? trust.status !== 'EPHEMERAL_PROTOTYPE_TEST_ONLY' || trust.runId !== lease.runId : trust.status !== 'INDEPENDENTLY_APPROVED') ||
      typeof trust.coordinatorPublicKey !== 'string' ||
      createPublicKey(trust.coordinatorPublicKey).asymmetricKeyType !== 'ed25519') unknown('coordinator authority unprepared; lease cannot self-authorize');
  const { authorization, ...preparedLease } = lease;
  if (typeof authorization !== 'string' || authorization.length > 256 ||
      !verify(null, Buffer.from(canonical(preparedLease)), trust.coordinatorPublicKey, Buffer.from(authorization, 'base64')))
    unknown('independent coordinator authorization missing/invalid');
  if (lease.version !== 1 || lease.state !== 'RESERVED' || lease.baselineSha256 !== BASELINE ||
      !/^[0-9a-f]{32}$/.test(lease.runId) || !/^[0-9a-f]{64}$/.test(lease.ownerNonce) ||
      typeof lease.owner !== 'string' || !lease.owner || lease.clockDomain !== 'darwin-mach-continuous-ns-node24.18' ||
      typeof lease.t0Ns !== 'string' || !/^\d{1,24}$/.test(lease.t0Ns)) unknown('lease schema/authority');
  if (!['synthetic', 'real'].includes(lease.policy)) unknown('deadline policy');
  const t0 = BigInt(lease.t0Ns), deadline = t0 + BigInt(lease.policy === 'synthetic' ? 5 : 120) * 1000000000n;
  if (now() < t0) unknown('future T0');
  remaining(deadline);
  const preflight = startupDeadline < deadline ? startupDeadline : deadline;
  if (lease.guardSource?.path !== resolve(guardSource) || lease.adapterSource?.path !== resolve(adapterSource) ||
      lease.commandSha256 !== sha(Buffer.from(canonical(command)))) unknown('source/command binding');
  await sealed(lease.guardSource, preflight); await sealed(lease.adapterSource, preflight);
  await sealed(lease.probe, preflight, 512 * 1024 * 1024);
  await sealed(lease.probeSource, preflight);
  await sealed(lease.bootstrap, preflight, 512 * 1024 * 1024);
  await sealed(lease.bootstrapSource, preflight);
  if (lease.bootstrap.protocol !== 'STOP_BEFORE_FORK_V1' ||
      !Array.isArray(lease.bootstrap.argv) || lease.bootstrap.argv.length > 128 ||
      !lease.bootstrap.argv.every(a => typeof a === 'string' && a.length <= 8192)) unknown('sealed bootstrap argv');
  const guard = identity(lease.guard), anchor = identity(lease.anchor);
  const G = anchor.pid;
  if (guard.pid !== process.pid || anchor.pgid !== G || anchor.sid !== G ||
      guard.pgid !== G || guard.sid !== G || guard.pid === G) unknown('not a dedicated inherited anchored session');
  const pending = new Set();
  for (const expected of [guard, anchor]) {
    if (!same(expected, await probeIdentity(lease.probe.path, expected.pid, preflight, pending))) unknown('live guard/anchor identity mismatch');
  }
  if (!lease.peers || Object.keys(lease.peers).sort().join(',') !== 'supervisor,watchdog') unknown('independent peers missing');
  if (lease.peers.supervisor.publicKey === lease.peers.watchdog.publicKey ||
      lease.peers.supervisor.socket === lease.peers.watchdog.socket) unknown('peers not independent');
  for (const peer of Object.values(lease.peers)) {
    identity(peer.identity);
    if (peer.identity.pgid === G || peer.identity.sid === G ||
        [guard.pid, anchor.pid].includes(peer.identity.pid)) unknown('controller inside terminated group');
    if (!digest(peer.headSha256) || !Number.isSafeInteger(peer.nextSeq) || peer.nextSeq < 0 ||
        createPublicKey(peer.publicKey).asymmetricKeyType !== 'ed25519') unknown('peer key/sequence');
  }
  if (lease.peers.supervisor.identity.pid === lease.peers.watchdog.identity.pid) unknown('same controller twice');
  let closed = false, published = false, handedOff = false, bootstrapObserved = false, busy = false;
  const heads = Object.fromEntries(['supervisor', 'watchdog'].map(k => [k, { seq: lease.peers[k].nextSeq, previous: lease.peers[k].headSha256 }]));

  async function receipt(role, request, operationDeadline) {
    const peer = lease.peers[role], head = heads[role];
    if (!same(peer.identity, await probeIdentity(lease.probe.path, peer.identity.pid, operationDeadline, pending))) unknown(role + ' live identity mismatch');
    const response = await ipc(peer.socket, request, operationDeadline);
    if (!response || typeof response.recordFile !== 'string' || !/^[0-9a-f]{64}\.json$/.test(response.recordFile) ||
        !digest(response.recordSha256) || response.recordFile !== response.recordSha256 + '.json') unknown('immutable receipt reference');
    const path = join(lease.receiptRoot, response.recordFile);
    await privatePath(lease.receiptRoot, 'directory', operationDeadline);
    await privatePath(path, 'file', operationDeadline);
    const raw = await bytes(path, 262144, operationDeadline);
    if (sha(raw) !== response.recordSha256) unknown('durable receipt byte hash');
    const record = JSON.parse(raw.toString('utf8')), body = record.body;
    if (!body || typeof record.signature !== 'string' || record.signature.length > 256 ||
        !verify(null, Buffer.from(canonical(body)), peer.publicKey, Buffer.from(record.signature, 'base64'))) unknown('independent receipt signature');
    if (body.version !== 1 || body.runId !== lease.runId || body.ownerNonce !== lease.ownerNonce ||
        body.challenge !== request.challenge || body.requestSha256 !== sha(Buffer.from(canonical(request))) ||
        body.seq !== head.seq || body.previous !== head.previous || body.role !== role ||
        !same(identity(body.writer), peer.identity) || body.publication !== 'FSYNCED_IMMUTABLE' ||
        body.state !== 'ACKNOWLEDGED' || body.verification !== 'INDEPENDENT_OWNERSHIP_AND_OBSERVATION' ||
        typeof body.observedNs !== 'string' || !/^\d{1,24}$/.test(body.observedNs)) unknown('receipt ownership/sequence/state');
    const age = now() - BigInt(body.observedNs);
    if (age < 0 || age > 250000000n) unknown('stale/future receipt');
    head.seq++; head.previous = response.recordSha256;
    return { body, hash: response.recordSha256 };
  }
  async function exchange(kind, fields = {}) {
    if (busy) unknown('concurrent lease operation');
    busy = true;
    const operationDeadline = now() + 1000000000n < deadline ? now() + 1000000000n : deadline;
    try {
      const request = { version: 1, kind, runId: lease.runId, ownerNonce: lease.ownerNonce,
        owner: lease.owner, guard, anchor, G, leaseSha256, commandSha256: lease.commandSha256,
        challenge: randomBytes(32).toString('hex'), ...fields };
      const primary = await receipt('supervisor', request, operationDeadline);
      const second = await receipt('watchdog', { ...request, supervisorReceiptSha256: primary.hash }, operationDeadline);
      if (second.body.supervisorReceiptSha256 !== primary.hash) unknown('watchdog did not acknowledge exact supervisor publication');
      remaining(operationDeadline);
      return primary.body;
    } catch (e) { closed = true; throw e; }
    finally { busy = false; }
  }
  // Durable group publication is an actual challenge/response round trip with
  // both live peers, not a lease token or static file authorising a PID.
  await exchange('validate-lease', { guardSource: lease.guardSource.sha256, adapterSource: lease.adapterSource.sha256 });
  return {
    group: G, guardIdentity: guard, runId: lease.runId, t0Ns: String(t0), deadlineNs: String(deadline),
    async publishBeforeSpawn() {
      if (closed || published) unknown('launch closed/already published');
      await exchange('publish-group-before-fork'); published = true;
    },
    spawnSpec() {
      if (closed || !published || handedOff) unknown('no unused durable pre-fork permission');
      remaining(deadline);
      handedOff = true; // consumed before handing the only spec to synchronous spawn
      return { executable: lease.bootstrap.path, args: [...lease.bootstrap.argv],
        env: { P6_REGISTERED_LEASE: leasePath, P6_REGISTERED_RUN: lease.runId } };
    },
    async observeBootstrap(childPid) {
      if (!pid(childPid) || closed || !published || bootstrapObserved) unknown('bootstrap spawn state');
      const stopDeadline = now() + 1000000000n < deadline ? now() + 1000000000n : deadline;
      let observed;
      for (let attempt = 0; attempt < 4; attempt++) {
        observed = await probeIdentity(lease.probe.path, childPid, stopDeadline, pending);
        if (observed.status === 4) break;
        if (attempt < 3) await bounded(new Promise(r => setTimeout(r, 10)), stopDeadline, 20);
      }
      if (observed.status !== 4 || observed.ppid !== guard.pid ||
          observed.pgid !== G || observed.sid !== G || observed.exe !== lease.bootstrap.path ||
          observed.exeSha256 !== lease.bootstrap.sha256) unknown('bootstrap escaped inherited sealed group');
      await exchange('bootstrap-inherited-identity', { bootstrap: observed });
      bootstrapObserved = true;
    },
    async sample() {
      if (closed || !bootstrapObserved) unknown('sample without acknowledged bootstrap');
      const body = await exchange('observe-cohort');
      if (body.inspection !== 'KNOWN_COMPLETE' || !Array.isArray(body.cohort) ||
          !body.cohort.length || body.cohort.length > 256 || !digest(body.registrySha256)) unknown('cohort unknown/size');
      const seen = new Set(); let kb = 0;
      for (const row of body.cohort) {
        identity(row);
        if (seen.has(row.pid) || !Number.isSafeInteger(row.memoryBytes) || row.memoryBytes < 0) unknown('cohort duplicate/memory');
        seen.add(row.pid); kb += row.memoryBytes / 1024;
      }
      for (const expected of [guard, anchor, lease.peers.supervisor.identity, lease.peers.watchdog.identity]) {
        if (!body.cohort.some(p => same(p, expected))) unknown('cohort omits required controller/anchor');
      }
      return { rows: body.cohort, kb };
    },
    async stop(reason) {
      closed = true;
      try {
        await exchange('stop-intent-close-launches', { reason: String(reason).slice(0, 512),
          unresolvedProbePids: [...pending], reservation: 'HELD', signalsDeliveredByGuard: false });
        return { acknowledged: true, reservation: 'HELD' };
      } catch (e) {
        return { acknowledged: false, reservation: 'UNRESOLVED_HELD', error: String(e.message).slice(0, 512) };
      }
    },
  };
}
