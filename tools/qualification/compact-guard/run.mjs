// Concrete prototype-only cold-path harness. Keys are generated ONLY when this
// entry is separately allocated and executed; source construction creates none.
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdir, readFile, realpath, readdir, lstat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { broker, json, publish, fileSeal, observed, socketRequest, canonical, sha, clock, sleep, bounded } from './harness-lib.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = '45e4edaee20eba1b2d8ec67983ed3acc06be31a64eb059e8bc4ad21257871374';
const variants = { D5: ['inherited', 'session', 'worker', 'bootstrap'], D9: ['timeout', 'malformed'],
  D10: ['birth', 'planned-group'], D12: ['death', 'channel-loss'] };
export async function main(configPath) {
  const c = await json(configPath), root = c.root;
  if (process.versions.node !== '24.18.0' || (await fileSeal(process.execPath)).sha256 !== '72c18e2eeda260f67a5b2b66e96fa9b5ad82864676ebb54925695d87120cae3f') throw Error('pinned Node/libuv clock dependency differs');
  if (!(variants[c.case] ?? ['only']).includes(c.variant)) throw Error('case/variant not in finite inventory');
  c.node = process.execPath;
  const deadline = BigInt(c.t0Ns) + BigInt(c.policy === 'synthetic' ? 5 : 120) * 1000000000n;
  async function wait(read, label) {
    while (clock() < deadline) { const value = await read(); if (value) return value; await sleep(5); }
    throw Error('NOT_ACTIVATED_INCOMPLETE: ' + label);
  }
  const marker = value => publish(root + '/activated.json', { case: c.case, variant: c.variant, monoNs: String(clock()), ...value });
  const sourcePaths = ['root.py', 'harness-lib.mjs', 'run.mjs', 'peer.mjs', 'guard-entry.mjs', 'fixture.mjs',
    'ack-check.mjs', 'mem-guard.prototype.mjs', 'lease-adapter.mjs'];
  const sources = {};
  for (const f of sourcePaths) sources[f] = await fileSeal(join(HERE, f));
  const pythonRuntime = await observed(c.probe, c.coordinatorPid, deadline);
  c.executableSeals = { [c.node]: await fileSeal(c.node), [pythonRuntime.exe]: await fileSeal(pythonRuntime.exe) };
  if ((await fileSeal(join(HERE, 'mem-guard.baseline.mjs'))).sha256 !== BASELINE) throw Error('baseline changed');
  // These are ephemeral TEST keys, scoped to this exclusive run. No production
  // root, reusable secret, approval record or remote artifact is fabricated.
  c.publicKeys = {};
  for (const role of ['coordinator', 'supervisor', 'watchdog']) {
    const key = generateKeyPairSync('ed25519');
    c.publicKeys[role] = key.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await publish(root + '/' + role + '.key', key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), true);
  }
  await mkdir(root + '/receipts', { mode: 0o700 });
  await publish(root + '/test-authority.json', { version: 1, status: 'EPHEMERAL_PROTOTYPE_TEST_ONLY',
    coordinatorPublicKey: c.publicKeys.coordinator, runId: c.runId, scope: 'NO_PRODUCTION_AUTHORITY' }, true);
  await publish(root + '/test-authority-location.json', await fileSeal(root + '/test-authority.json'));
  await publish(root + '/harness.json', c);
  const launchRecords = [];
  async function dualTransition(g, mutate = null) {
    const req = { kind: 'controlled-transition', runId: c.runId, capability: c.capability,
      token: g.token, generation: g.generation, phase: g.phase,
      anchorBirth: [g.pid, g.birthSec, g.birthUsec], plannedGroup: g.pid, planSha256: g.planSha256 };
    if (mutate) mutate(req);
    const bundle = {};
    for (const role of ['supervisor', 'watchdog']) {
      const reply = await socketRequest(root + '/' + role + '.sock', req, deadline);
      if (reply.error) return { withheld: true, error: reply.error };
      bundle[role] = reply.recordSha256;
    }
    if (mutate) throw Error('negative transition unexpectedly admitted');
    await broker(c, 'continue', { token: g.token, ackBundle: bundle });
    return { admitted: true, bundle };
  }
  async function group(argv, { startup = false, stopAt = null } = {}) {
    argv = [...argv]; argv[0] = await realpath(argv[0]);
    const token = randomBytes(32).toString('hex');
    let state = await broker(c, 'create', { token, argv, env: { ...process.env }, startupOnly: startup,
      executableSeal: await fileSeal(argv[0]), scriptSeals: Object.values(sources) });
    let g = state.groups.find(g => g.token === token);
    launchRecords.push(g); await publish(root + '/launches.json', launchRecords);
    async function cont() {
      if (startup) await broker(c, 'continue', { token });
      else if (!(await dualTransition(g)).admitted) throw Error('dual transition refused');
      state = await broker(c, 'status'); g = state.groups.find(g => g.token === token);
    }
    if (stopAt === 'inherited') return g;
    await cont(); if (stopAt === 'session') return g;
    await cont();
    await wait(async () => (await broker(c, 'snapshot')).rows.find(p => p.ppid === g.pid && p.status === 4), 'actual worker stop');
    if (stopAt === 'worker') return g;
    await cont(); return g;
  }
  const peers = {};
  for (const role of ['supervisor', 'watchdog']) {
    const g = await group([c.node, join(HERE, 'peer.mjs'), root + '/harness.json', role], { startup: true });
    peers[role] = { group: g, ready: await wait(() => json(root + '/' + role + '-ready.json').catch(() => null), role + ' readiness') };
  }
  await wait(async () => {
    const beats = await Promise.all(['supervisor', 'watchdog'].map(role => json(root + '/' + role + '-heartbeat.json').catch(() => null)));
    return beats.every(p => p && p.channelOpen && clock() - BigInt(p.monoNs) < 250000000n);
  }, 'both live independent heartbeat streams');
  await publish(root + '/peers-armed.json', { armed: true, t0Ns: c.t0Ns });
  const guardGroup = await group([c.node, join(HERE, 'guard-entry.mjs'), root + '/harness.json'], { startup: true });
  const entry = await wait(() => json(root + '/guard-entry.json').catch(() => null), 'guard self-stop');
  const guard = await wait(async () => { const p = await observed(c.probe, entry.identity.pid, deadline); return p.status === 4 ? p : null; }, 'guard stopped Node identity');
  const anchor = await observed(c.probe, guardGroup.pid, deadline);
  const python = pythonRuntime;
  const command = [c.node, join(HERE, 'fixture.mjs'), root + '/harness.json'];
  const lease = { version: 1, state: 'RESERVED', baselineSha256: BASELINE, runId: c.runId,
    owner: c.owner, ownerNonce: c.ownerNonce, clockDomain: 'darwin-mach-continuous-ns-node24.18', t0Ns: c.t0Ns, policy: c.policy,
    guardSource: sources['mem-guard.prototype.mjs'], adapterSource: sources['lease-adapter.mjs'],
    probe: sources['root.py'], probeSource: sources['root.py'], bootstrapSource: sources['root.py'],
    bootstrap: { path: python.exe, sha256: python.exeSha256, protocol: 'STOP_BEFORE_FORK_V1',
      argv: [join(HERE, 'root.py'), 'bootstrap', ...command] },
    guard, anchor, groupToken: guardGroup.token, commandSha256: sha(canonical(command)),
    receiptRoot: root + '/receipts', peers: Object.fromEntries(['supervisor', 'watchdog'].map(role => [role, {
      identity: peers[role].ready.identity, publicKey: c.publicKeys[role], socket: root + '/' + role + '.sock',
      nextSeq: 0, headSha256: '0'.repeat(64) }])) };
  lease.authorization = sign(null, Buffer.from(canonical(lease)), await readFile(root + '/coordinator.key', 'utf8')).toString('base64');
  await publish(root + '/lease.json', lease);
  await publish(root + '/runtime-source-seal.json', { sources, node: await fileSeal(c.node), python: await fileSeal(python.exe),
    protocol: 'PROTOTYPE_EPHEMERAL_TEST_ONLY', t0Ns: c.t0Ns, preparedAtNs: String(clock()) });
  await publish(root + '/guard-argv.json', [c.node, join(HERE, 'mem-guard.prototype.mjs'), '--limit', '700', '--wait', '0',
    '--name', 'P6-VE7-' + c.case + '-' + c.variant, '--log', root + '/resources.jsonl', '--registered-launch', root + '/lease.json', '--', ...command]);
  await dualTransition((await broker(c, 'status')).groups.find(g => g.token === guardGroup.token));
  const dual = await wait(() => json(root + '/bootstrap-dual-ack-ready.json').catch(() => null), 'bootstrap dual stopped acknowledgement');
  if (c.case === 'D5' && c.variant === 'bootstrap') {
    const stopped = await observed(c.probe, dual.bootstrap.pid, deadline);
    if (stopped.status !== 4 || stopped.ppid !== guard.pid || stopped.sid !== anchor.pid || stopped.pgid !== anchor.pid) throw Error('bootstrap not actually stopped in G');
    await marker({ kind: 'bootstrap-stop-dual-ack-withheld', dual, bootstrapIdentity: stopped });
  } else {
    await dualTransition((await broker(c, 'status')).groups.find(g => g.token === guardGroup.token));
  }
  if (c.case === 'D5' && c.variant !== 'bootstrap') {
    const g = await group(command, { stopAt: c.variant });
    await marker({ kind: 'actual-stopped-boundary', group: g, boundary: c.variant,
      kernelRows: (await broker(c, 'snapshot')).rows.filter(p => p.sid === g.pid || p.pid === g.pid) });
  } else if (c.case === 'D4' || c.case === 'D7') {
    const g = await group([...command, 'orphan-parent']);
    const ready = await wait(() => json(root + '/orphan-child-ready.json').catch(() => null), 'actual detached grandchild');
    const parent = await wait(() => json(root + '/orphan-parent-returning.json').catch(() => null), 'actual immediate parent return');
    const live = await wait(async () => {
      const rows = (await broker(c, 'snapshot')).rows;
      return !rows.some(p => p.pid === parent.pid) && rows.find(p => p.pid === ready.pid && p.sid === g.pid) ? rows : null;
    }, 'parent gone while registered grandchild lives');
    await marker({ kind: 'registered-detached-work-live', group: g, live, parent, child: ready, parentGoneObserved: true });
    if (c.case === 'D7') await broker(c, 'kill-token', { token: guardGroup.token });
  } else if (c.case === 'D8' || (c.case === 'D12' && c.variant === 'death')) {
    const target = c.case === 'D8' ? peers.supervisor : peers.watchdog;
    await marker({ kind: 'owned-peer-kill-request', target: target.ready.identity });
    await broker(c, 'kill-token', { token: target.group.token });
  } else if (c.case === 'D12') {
    await publish(root + '/fault.json', { kind: 'watchdog-channel-loss' });
    await wait(() => json(root + '/activated.json').catch(() => null), 'watchdog channel actually closed');
  } else if (c.case === 'D9') {
    const flag = c.variant === 'timeout' ? 'probe-hang' : 'probe-malformed';
    const child = spawn(c.probe, [flag], { detached: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let raw = ''; child.stdout.on('data', b => { if (raw.length < 65536) raw += b; });
    let refusalObserved = false;
    if (c.variant === 'timeout') {
      try { await bounded(new Promise(resolve => child.once('close', resolve)), clock() + 150000000n, 150); }
      catch { refusalObserved = true; }
    } else {
      await bounded(new Promise(resolve => child.once('close', resolve)), deadline, 150);
      try { JSON.parse(raw); } catch { refusalObserved = true; }
    }
    if (!refusalObserved) throw Error('inspection negative unexpectedly accepted');
    let ipcTimeoutObserved = false, expiredAdmissionRefused = false, noExpiredSpawn = false;
    if (c.variant === 'timeout') {
      const { createServer } = await import('node:net');
      const sockets = new Set(); let accepted;
      const connected = new Promise(resolve => { accepted = resolve; });
      const server = createServer({ allowHalfOpen: true }, socket => { sockets.add(socket); socket.on('error', () => {}); accepted(); });
      await new Promise(resolve => server.listen(root + '/timeout-probe.sock', resolve));
      const request = socketRequest(root + '/timeout-probe.sock', { kind: 'actual-withheld-reply' }, deadline);
      await connected;
      try { await request; } catch { ipcTimeoutObserved = true; }
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
      const { loadRegisteredLease } = await import('./lease-adapter.mjs');
      const { authorization, ...expired } = lease;
      if (clock() < 10000000000n) throw Error('NOT_ACTIVATED_INCOMPLETE: clock too early for expired-lease fixture');
      expired.t0Ns = String(clock() - 10000000000n);
      expired.authorization = sign(null, Buffer.from(canonical(expired)), await readFile(root + '/coordinator.key', 'utf8')).toString('base64');
      await publish(root + '/expired-lease.json', expired);
      const before = (await broker(c, 'status')).groups.length;
      const oldTrust = process.env.P6_PROTOTYPE_TEST_AUTHORITY, oldHash = process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256;
      process.env.P6_PROTOTYPE_TEST_AUTHORITY = root + '/test-authority.json';
      process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256 = (await fileSeal(root + '/test-authority.json')).sha256;
      try { await loadRegisteredLease({ leasePath: root + '/expired-lease.json', command, guardSource: sources['mem-guard.prototype.mjs'].path, adapterSource: sources['lease-adapter.mjs'].path }); }
      catch (e) { expiredAdmissionRefused = String(e.message).includes('absolute deadline'); }
      finally {
        if (oldTrust === undefined) delete process.env.P6_PROTOTYPE_TEST_AUTHORITY; else process.env.P6_PROTOTYPE_TEST_AUTHORITY = oldTrust;
        if (oldHash === undefined) delete process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256; else process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256 = oldHash;
      }
      noExpiredSpawn = (await broker(c, 'status')).groups.length === before;
      if (!ipcTimeoutObserved || !expiredAdmissionRefused || !noExpiredSpawn) throw Error('D9 timeout/expiry assertions incomplete');
    }
    await marker({ kind: 'actual-inspection-' + c.variant, probePid: child.pid, output: raw.slice(0, 128), timeoutMs: 150, refusalObserved,
      ipcTimeoutObserved, expiredAdmissionRefused, noExpiredSpawn });
    await publish(root + '/result.json', { classification: 'EXPECTED_INSPECTION_UNKNOWN', activated: true });
  } else if (c.case === 'D10') {
    const g = await group(command, { stopAt: 'inherited' });
    const result = await dualTransition(g, req => { if (c.variant === 'birth') req.anchorBirth[1]++; else req.plannedGroup++; });
    if (!result.withheld || !result.error.includes(c.variant === 'birth' ? 'birth mismatch' : 'planned-group mismatch')) throw Error('intended identity negative not observed');
    const after = (await broker(c, 'status')).groups.find(p => p.token === g.token);
    if (after.generation !== g.generation) throw Error('negative transition changed generation');
    await marker({ kind: 'unsafe-transition-withheld', result, before: g, after });
    await publish(root + '/result.json', { classification: 'EXPECTED_IDENTITY_REFUSAL', activated: true });
  } else if (c.case === 'D6') {
    await wait(() => json(root + '/activated.json').catch(() => null), 'actual synthetic attachment callback stall');
  } else if (c.case.startsWith('B')) {
    await actualBrowser(c, group, marker, deadline);
  }
  if (['D1', 'D2', 'D3', 'D11'].includes(c.case)) await wait(() => json(root + '/activated.json').catch(() => null), 'actual worker activation');
  if (c.case === 'D11') {
    await wait(() => json(root + '/worker-returned.json').catch(() => null), 'worker returned');
    const end = await wait(async () => {
      const text = await readFile(root + '/resources.jsonl', 'utf8').catch(() => '');
      return text.trim().split('\n').filter(Boolean).map(x => JSON.parse(x)).find(x => x.event === 'end' && x.code === 0);
    }, 'actual bootstrap exit status zero');
    const rows = (await broker(c, 'snapshot')).rows;
    if (rows.some(p => p.pid === guard.pid && p.birthSec === guard.birthSec && p.birthUsec === guard.birthUsec)) throw Error('guard not yet exited');
    await publish(root + '/result.json', { classification: 'NORMAL_EXIT_OBSERVED_CLEANUP_PENDING', activated: true, end });
  }
  await publish(root + '/harness-ready.json', { case: c.case, variant: c.variant, t0Ns: c.t0Ns, readyAtNs: String(clock()) });
  while (clock() < deadline) await sleep(10);
  throw Error('absolute deadline; external cleanup verification required');
}

async function actualBrowser(c, group, marker, deadline) {
  const fromTecos = createRequire(new URL('../../../tec-os/package.json', import.meta.url));
  const { chromium } = fromTecos('playwright'); // exact local dependency, no global fallback
  const exe = await realpath(chromium.executablePath()), profile = c.root + '/browser-profile';
  const app = exe.lastIndexOf('.app/Contents/');
  const bundleRoot = app >= 0 ? exe.slice(0, app + 4) : dirname(exe);
  let entries = 0, executables = 0, executableBytes = 0;
  async function sealExecutables(path, depth = 0) {
    if (clock() >= deadline || depth > 12 || ++entries > 4096) throw Error('browser dependency tree budget');
    const info = await lstat(path);
    if (info.isSymbolicLink()) return; // real version directories are traversed once
    if (info.isDirectory()) { for (const name of (await readdir(path)).sort()) await sealExecutables(join(path, name), depth + 1); }
    else if (info.isFile() && (info.mode & 0o111)) {
      if (++executables > 256 || (executableBytes += info.size) > 2 * 1024 * 1024 * 1024) throw Error('browser executable inventory bound');
      const actual = await realpath(path); c.executableSeals[actual] = await fileSeal(actual);
    }
  }
  await sealExecutables(bundleRoot);
  c.executableSeals[exe] ??= await fileSeal(exe); await publish(c.root + '/harness.json', c);
  await mkdir(profile, { mode: 0o700 });
  const args = [exe, '--headless', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'];
  const browserGroup = await group(args);
  const browserMain = await bounded((async () => {
    while (clock() < deadline) {
      const rows = (await broker(c, 'snapshot')).rows;
      const p = rows.find(p => p.ppid === browserGroup.pid && p.exe === exe);
      if (p) return p; await sleep(5);
    }
    throw Error('actual browser main identity missing');
  })(), deadline, 1000);
  const activeFile = profile + '/DevToolsActivePort'; let endpoint;
  while (clock() < deadline) {
    const text = await readFile(activeFile, 'utf8').catch(() => '');
    if (text.includes('\n')) { const [port, path] = text.trim().split('\n'); if (!/^\d+$/.test(port) || !path.startsWith('/devtools/')) throw Error('CDP endpoint'); endpoint = 'ws://127.0.0.1:' + port + path; break; }
    await sleep(10);
  }
  if (!endpoint) throw Error('NOT_ACTIVATED_INCOMPLETE: actual Chromium endpoint');
  const dependencyPaths = Object.keys(fromTecos.cache).filter(p => p.includes('/playwright'));
  if (dependencyPaths.length > 1024) throw Error('resolved dependency count bound');
  const dependencySeals = [];
  for (const path of dependencyPaths) dependencySeals.push(await fileSeal(path));
  await publish(c.root + '/browser-seal.json', { executable: await fileSeal(exe), args, group: browserGroup,
    playwright: await fileSeal(fromTecos.resolve('playwright')), playwrightCore: await fileSeal(fromTecos.resolve('playwright-core')),
    actualResolvedFiles: dependencySeals,
    actualBrowserMain: browserMain,
    node: await fileSeal(c.node), servedOrigin: 'loopback-only', endpoint });
  const { createServer } = await import('node:http');
  if (c.case === 'B2') {
    const proxy = createServer();
    proxy.on('upgrade', async (_req, socket) => { await marker({ kind: 'actual-browser-attachment-upgrade-stalled', browserGroup, endpoint }); socket.on('error', () => {}); });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    // An actual WebSocket handshake is accepted but deliberately never answered.
    await chromium.connectOverCDP('ws://127.0.0.1:' + proxy.address().port + new URL(endpoint).pathname, { timeout: Math.max(1, Number((deadline - clock()) / 1000000n)) });
    throw Error('stalled attachment unexpectedly completed');
  }
  const html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#001006;color:#5edc78;font:16px monospace}</style><p>Owned Chromium/CDP native capture</p>';
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 1000 });
  const context = await browser.newContext({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  let received;
  page.on('response', async r => { if (r.url().startsWith('http://127.0.0.1:')) received = { url: r.url(), status: r.status(), sha256: sha(await r.body()) }; });
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'load', timeout: 1000 });
  const png = await page.screenshot({ path: c.root + '/native.png' });
  await context.close();
  const closeSession = await browser.newBrowserCDPSession();
  await closeSession.send('Browser.close').catch(e => { if (!String(e).includes('closed')) throw e; });
  await browser.close();
  while (clock() < deadline) {
    const rows = (await broker(c, 'snapshot')).rows;
    if (!rows.some(p => p.pid === browserMain.pid && p.birthSec === browserMain.birthSec && p.birthUsec === browserMain.birthUsec)) break;
    await sleep(5);
  }
  if ((await broker(c, 'snapshot')).rows.some(p => p.pid === browserMain.pid && p.birthSec === browserMain.birthSec && p.birthUsec === browserMain.birthUsec)) throw Error('normal browser close not observed');
  await publish(c.root + '/browser-close-observed.json', { actualBrowserMain: browserMain, observedGoneAtNs: String(clock()) });
  await new Promise(resolve => server.close(resolve));
  if (!received || received.sha256 !== sha(html)) throw Error('served bytes not proved');
  await marker({ kind: 'actual-browser-cdp-native-capture', browserGroup, received, expectedBodySha256: sha(html), pngSha256: sha(png), viewport: [600, 900, 1] });
  await publish(c.root + '/result.json', { classification: 'BROWSER_CAPTURE_COMPLETE_CLEANUP_PENDING', activated: true });
}
if (process.argv[1]?.endsWith('/run.mjs')) main(process.argv[2]).catch(async e => {
  try { const c = await json(process.argv[2]); await publish(c.root + '/result.json', { classification: String(e.message).includes('NOT_ACTIVATED') ? 'NOT_ACTIVATED_INCOMPLETE' : 'SOURCE_CANDIDATE_FAILURE', error: String(e.stack), atNs: String(clock()) }); } catch {}
  process.exitCode = 70;
});
