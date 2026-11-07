// Independent supervisor OR watchdog process; each has its own group/key/socket.
import { createServer } from 'node:net';
import { readFile, appendFile, open, chmod, stat } from 'node:fs/promises';
import { verify } from 'node:crypto';
import { broker, json, observed, canonical, sha, signedReceipt, publish, clock } from './harness-lib.mjs';

export async function main(path, role) {
  if (!['supervisor', 'watchdog'].includes(role)) throw Error('peer role');
  const c = await json(path), root = c.root, deadline = BigInt(c.t0Ns) + BigInt(c.policy === 'synthetic' ? 5 : 120) * 1000000000n;
  const key = await readFile(root + '/' + role + '.key', 'utf8');
  const self = await observed(c.probe, process.pid, deadline);
  let seq = 0, previous = '0'.repeat(64), closed = false, responding = false, channelOpen = true;
  const other = role === 'watchdog' ? 'supervisor' : 'watchdog';
  async function stop(reason) {
    closed = true;
    await publish(root + '/' + role + '-stop.json', { reason, monoNs: String(clock()), identity: self });
    await broker(c, 'kill');
  }
  async function request(req) {
    if (responding) throw Error('concurrent peer request'); responding = true;
    try {
      if (req.kind === 'controlled-transition') {
        if (req.runId !== c.runId || req.capability !== c.capability) throw Error('transition run authority');
        const state = await broker(c, 'status');
        const g = state.groups.find(g => g.token === req.token && !g.retired);
        if (!g || state.closed) throw Error('transition launches closed/missing token');
        if (req.plannedGroup !== g.pid) throw Error('planned-group mismatch');
        if (canonical(req.anchorBirth) !== canonical([g.pid, g.birthSec, g.birthUsec])) throw Error('birth mismatch');
        if (g.phase !== req.phase || g.generation !== req.generation) throw Error('transition generation mismatch');
        if (g.planSha256 !== req.planSha256) throw Error('transition plan differs');
        return signedReceipt(root + '/receipts', { kind: req.kind, version: 1, role, runId: c.runId,
          token: g.token, generation: g.generation, phase: g.phase,
          anchorBirth: [g.pid, g.birthSec, g.birthUsec], plannedGroup: g.pid, planSha256: g.planSha256, publication: 'FSYNCED_IMMUTABLE',
          deadlineNs: String(deadline), monoNs: String(clock()) }, key);
      }
      const lease = await json(root + '/lease.json');
      if (req.runId !== c.runId || req.ownerNonce !== c.ownerNonce || req.owner !== c.owner ||
          req.leaseSha256 !== sha(await readFile(root + '/lease.json')) ||
          canonical(req.guard) !== canonical(lease.guard) || canonical(req.anchor) !== canonical(lease.anchor) ||
          req.G !== lease.anchor.pid || req.commandSha256 !== lease.commandSha256 ||
          !/^[0-9a-f]{64}$/.test(req.challenge)) throw Error('lease/request admission');
      if (closed && req.kind !== 'stop-intent-close-launches') throw Error('launches closed');
      const snapshot = await broker(c, 'snapshot');
      for (const expected of [lease.guard, lease.anchor]) {
        if (!snapshot.rows.some(p => ['pid', 'birthSec', 'birthUsec', 'pgid', 'sid'].every(k => p[k] === expected[k]))) throw Error('ownership disappeared');
        const independent = await observed(c.probe, expected.pid, deadline);
        if (!['pid', 'birthSec', 'birthUsec', 'exe', 'exeSha256', 'pgid', 'sid'].every(k => independent[k] === expected[k])) throw Error('independent ownership probe differs');
      }
      if (role === 'watchdog') {
        if (!/^[0-9a-f]{64}$/.test(req.supervisorReceiptSha256)) throw Error('primary receipt missing');
        const raw = await readFile(root + '/receipts/' + req.supervisorReceiptSha256 + '.json');
        const primary = JSON.parse(raw);
        if (sha(raw) !== req.supervisorReceiptSha256 || !verify(null, Buffer.from(canonical(primary.body)), c.publicKeys.supervisor, Buffer.from(primary.signature, 'base64'))) throw Error('primary signature');
        const { supervisorReceiptSha256, ...original } = req;
        if (primary.body.requestSha256 !== sha(canonical(original)) || primary.body.challenge !== req.challenge) throw Error('primary binds another request');
      }
      if (req.kind === 'bootstrap-inherited-identity') {
        const p = await observed(c.probe, req.bootstrap.pid, deadline);
        if (p.status !== 4 || p.ppid !== lease.guard.pid || p.sid !== req.G || p.pgid !== req.G ||
            p.exe !== lease.bootstrap.path || p.exeSha256 !== lease.bootstrap.sha256 ||
            !['pid', 'birthSec', 'birthUsec', 'exe', 'exeSha256', 'pgid', 'sid'].every(k => p[k] === req.bootstrap[k])) throw Error('bootstrap stop/identity');
      }
      const body = { version: 1, runId: c.runId, ownerNonce: c.ownerNonce, challenge: req.challenge,
        requestSha256: sha(canonical(req)), seq, previous, role, writer: self,
        publication: 'FSYNCED_IMMUTABLE', state: 'ACKNOWLEDGED', verification: 'INDEPENDENT_OWNERSHIP_AND_OBSERVATION',
        observedNs: String(clock()), ...(role === 'watchdog' ? { supervisorReceiptSha256: req.supervisorReceiptSha256 } : {}) };
      if (req.kind === 'observe-cohort') {
        // Kernel births/group/session/memory come from the independently polled
        // broker; executable bytes are inspected, never inferred from names.
        const cohort = [];
        const seals = (await json(root + '/harness.json')).executableSeals;
        for (const row of snapshot.rows) {
          const seal = seals[row.exe];
          if (!seal) throw Error('unsealed cohort executable');
          const info = await stat(row.exe);
          if (info.dev !== seal.dev || info.ino !== seal.ino || info.size !== seal.bytes || info.mtimeMs !== seal.mtimeMs) throw Error('sealed executable metadata changed');
          cohort.push({ ...row, exeSha256: seal.sha256, state: 'present' });
        }
        body.inspection = 'KNOWN_COMPLETE'; body.cohort = cohort; body.registrySha256 = snapshot.registrySha256;
        body.observedNs = String(clock());
      }
      const receipt = await signedReceipt(root + '/receipts', body, key);
      await appendFile(root + '/' + role + '-events.jsonl', canonical({ seq, previous, receipt, request: req }) + '\n', { mode: 0o600 });
      const f = await open(root + '/' + role + '-events.jsonl', 'r'); try { await f.sync(); } finally { await f.close(); }
      seq++; previous = receipt.recordSha256;
      if (role === 'watchdog' && req.kind === 'bootstrap-inherited-identity') {
        // Guard's pair of immutable receipts is not a raw continuation token.
        // Produce separately generation-bound transition approvals from BOTH
        // peers; the broker's retained-parent verifier checks their signatures.
        await publish(root + '/bootstrap-dual-ack-ready.json', { token: lease.groupToken, bootstrap: req.bootstrap,
          supervisorReceipt: req.supervisorReceiptSha256, watchdogReceipt: receipt.recordSha256 });
        await publish(root + '/bootstrap-committed.json', { identity: req.bootstrap, dualReceipt: receipt, monoNs: String(clock()) });
      }
      if (req.kind === 'stop-intent-close-launches') closed = true;
      return receipt;
    } finally { responding = false; }
  }
  const server = createServer({ allowHalfOpen: true }, socket => {
    let data = Buffer.alloc(0), handled = false;
    socket.setTimeout(150, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', async b => {
      if (handled || data.length + b.length > 65536) return socket.destroy();
      data = Buffer.concat([data, b]); if (!data.includes(10)) return;
      handled = true;
      try { socket.end(canonical(await request(JSON.parse(data.toString('utf8')))) + '\n'); }
      catch (e) {
        let kind; try { kind = JSON.parse(data.toString('utf8')).kind; } catch {}
        if (kind === 'controlled-transition') socket.end(canonical({ error: String(e.message), withheld: true }) + '\n');
        else { socket.destroy(); void stop('peer request rejected: ' + e.message).catch(() => {}); }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(root + '/' + role + '.sock', resolve); });
  await chmod(root + '/' + role + '.sock', 0o600);
  await publish(root + '/' + role + '-ready.json', { identity: self, monoNs: String(clock()) });
  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return; ticking = true;
    try {
      await publish(root + '/' + role + '-heartbeat.json', { identity: self, monoNs: String(clock()), channelOpen });
      const fault = await json(root + '/fault.json').catch(() => null);
      if (fault?.kind === 'watchdog-channel-loss' && role === 'watchdog' && channelOpen) {
        server.close(); channelOpen = false;
        await publish(root + '/activated.json', { kind: fault.kind, identity: self, channelOpen: false, monoNs: String(clock()) });
      }
      if (await json(root + '/peers-armed.json').catch(() => false)) {
        const peer = await json(root + '/' + other + '-heartbeat.json');
        if (!peer.channelOpen || clock() - BigInt(peer.monoNs) > 500000000n) await stop('peer heartbeat/channel lost');
        await broker(c, 'snapshot'); // independent cap/inspection loop
      }
      if (clock() >= deadline) await stop('absolute deadline');
    } catch (e) { await stop('inspection unknown: ' + e.message).catch(() => {}); }
    finally { ticking = false; }
  }, 100);
  process.on('SIGTERM', () => { closed = true; clearInterval(timer); server.close(); process.exitCode = 1; });
}
if (process.argv[1]?.endsWith('/peer.mjs')) main(process.argv[2], process.argv[3]).catch(e => { process.stderr.write(String(e.stack) + '\n'); process.exitCode = 70; });
