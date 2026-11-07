// Prototype harness functions. No work on import.
import { open, stat, readFile, rename } from 'node:fs/promises';
import { createHash, sign, randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
export const canonical = v => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' :
  v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
export const sha = v => createHash('sha256').update(v).digest('hex');
export const clock = () => process.hrtime.bigint();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function bounded(promise, deadline, cap = 150) {
  const left = Number((deadline - clock()) / 1000000n);
  if (left <= 0) throw Error('absolute deadline expired');
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('bounded operation unknown')), Math.min(left, cap)); })]); }
  finally { clearTimeout(timer); }
}
export async function json(path) {
  const info = await stat(path); if (info.size > 262144) throw Error('JSON byte bound');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function publish(path, value, immutable = false) {
  const temp = immutable ? path : path + '.' + randomBytes(8).toString('hex');
  const f = await open(temp, 'wx', 0o600);
  try { await f.writeFile(typeof value === 'string' ? value : canonical(value) + '\n'); await f.sync(); }
  finally { await f.close(); }
  if (!immutable) await rename(temp, path);
  const d = await open(dirname(path), 'r'); try { await d.sync(); } finally { await d.close(); }
}
export async function fileSeal(path) {
  const before = await stat(path); if (before.size > 512 * 1024 * 1024) throw Error('seal byte limit');
  const f = await open(path, 'r'), h = createHash('sha256');
  try {
    const b = Buffer.alloc(65536); let total = 0;
    for (;;) { const n = (await f.read(b, 0, b.length, null)).bytesRead; if (!n) break; total += n; if (total > before.size) throw Error('seal grew'); h.update(b.subarray(0, n)); }
    const after = await f.stat(); if (after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('seal changed');
    return { path, sha256: h.digest('hex'), bytes: before.size, dev: before.dev, ino: before.ino, mtimeMs: before.mtimeMs };
  } finally { await f.close(); }
}
export async function socketRequest(path, request, deadline) {
  return bounded(new Promise((resolve, reject) => {
    const s = createConnection(path); let data = Buffer.alloc(0), ended = false;
    const finish = (e, value) => { if (ended) return; ended = true; s.destroy(); e ? reject(e) : resolve(value); };
    const timer = setTimeout(() => finish(Error('IPC deadline')), 150);
    s.on('close', () => clearTimeout(timer)); s.on('error', e => finish(e));
    s.on('connect', () => s.end(canonical(request) + '\n'));
    s.on('data', b => {
      if (data.length + b.length > 262144) return finish(Error('IPC output bound'));
      data = Buffer.concat([data, b]); if (data.includes(10)) {
        try { finish(null, JSON.parse(data.toString('utf8'))); } catch (e) { finish(e); }
      }
    }); s.on('end', () => { if (!ended) finish(Error('partial IPC')); });
  }), deadline);
}
export async function broker(config, op, fields = {}) {
  const deadline = BigInt(config.t0Ns) + BigInt(config.policy === 'synthetic' ? 5 : 120) * 1000000000n;
  const reply = await socketRequest(config.root + '/broker.sock', { runId: config.runId, capability: config.capability, op, ...fields }, deadline);
  if (!reply.ok) throw Error(reply.error ?? 'broker refused'); return reply.result;
}
export async function observed(probe, pid, deadline) {
  // Inspection-only exact argv; never launch through this operation. On timeout
  // leave the known inherited group for broker cleanup, never kill numeric PID.
  const before = clock();
  return bounded(new Promise((resolve, reject) => {
    const child = spawn(probe, ['identity', String(pid)], { detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = Buffer.alloc(0), errorBytes = 0, done = false;
    const finish = (e, v) => { if (done) return; done = true; clearTimeout(timer); child.stdout.destroy(); child.stderr.destroy(); e ? reject(e) : resolve(v); };
    const timer = setTimeout(() => finish(Error('identity probe unknown; broker retains group')), 150);
    child.on('error', e => finish(e)); child.stdout.on('data', b => { if (out.length + b.length > 65536) finish(Error('probe bytes')); else out = Buffer.concat([out, b]); });
    child.stderr.on('data', b => { errorBytes += b.length; if (errorBytes > 65536) finish(Error('probe stderr')); });
    child.on('close', code => { if (done) return; try {
      const p = JSON.parse(out.toString('utf8'));
      if (code || p.state !== 'present') throw Error('probe absent/failed');
      if (p.clockDomain !== 'darwin-mach-continuous-ns-node24.18' || !/^\d+$/.test(p.clockNs) ||
          BigInt(p.clockNs) < before - 100000n || BigInt(p.clockNs) > clock() + 100000n) throw Error('cross-process clock bracket mismatch');
      finish(null, p);
    } catch (e) { finish(e); } });
  }), deadline);
}
export async function signedReceipt(root, body, privateKey) {
  const record = { body, signature: sign(null, Buffer.from(canonical(body)), privateKey).toString('base64') };
  const raw = canonical(record) + '\n', hash = sha(raw), file = hash + '.json';
  await publish(root + '/' + file, raw, true);
  return { recordFile: file, recordSha256: hash };
}
