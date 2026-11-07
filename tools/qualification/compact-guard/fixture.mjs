// Actual fault fixtures; activation markers follow the physical state change.
import { createServer } from 'node:http';
import { json, publish, clock, sleep, broker, observed } from './harness-lib.mjs';
import { spawn } from 'node:child_process';
export async function main(configPath, mode = 'worker') {
  const c = await json(configPath), marker = extra => publish(c.root + '/activated.json', { case: c.case, variant: c.variant, identityPid: process.pid, monoNs: String(clock()), ...extra });
  if (mode === 'orphan-child') {
    await publish(c.root + '/orphan-child-ready.json', { pid: process.pid, originalParent: process.ppid });
    setInterval(() => {}, 1000); return;
  }
  if (mode === 'orphan-parent') {
    const child = spawn(c.node, [new URL(import.meta.url).pathname, configPath, 'orphan-child'], { detached: false, stdio: 'ignore' });
    child.unref(); // parent really exits while the registered-session child lives
    while (!(await json(c.root + '/orphan-child-ready.json').catch(() => null))) await sleep(5);
    await publish(c.root + '/orphan-parent-returning.json', { pid: process.pid }); return;
  }
  if (mode === 'ignore-child' || mode === 'ignore-grandchild') {
    process.on('SIGTERM', () => { void publish(c.root + '/' + mode + '-term.json', { pid: process.pid, continuedAlive: true, monoNs: String(clock()) }); });
    if (mode === 'ignore-child') spawn(c.node, [new URL(import.meta.url).pathname, configPath, 'ignore-grandchild'], { detached: false, stdio: 'ignore' });
    await publish(c.root + '/' + mode + '-ready.json', { pid: process.pid }); setInterval(() => {}, 1000); return;
  }
  if (c.case === 'D1') { await marker({ kind: 'hung-worker-entered' }); for (;;) {} }
  if (c.case === 'D2') {
    let accepted;
    const requestAccepted = new Promise(resolve => { accepted = resolve; });
    const server = createServer((_req, _res) => { accepted(); /* deliberately never end the active response */ });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { createConnection } = await import('node:net');
    const held = createConnection(server.address().port, '127.0.0.1');
    await new Promise(resolve => held.once('connect', resolve));
    held.write('GET /held HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n');
    await requestAccepted;
    server.close(() => { void publish(c.root + '/unexpected-close.json', { callbackRan: true }); });
    await marker({ kind: 'actual-server-close-waiting', heldSocket: true, activeRequestAccepted: true, closeCalled: true }); return;
  }
  if (c.case === 'D3') {
    process.on('SIGTERM', () => { void publish(c.root + '/worker-term.json', { pid: process.pid, handlerRan: true, monoNs: String(clock()) }); });
    spawn(c.node, [new URL(import.meta.url).pathname, configPath, 'ignore-child'], { detached: false, stdio: 'ignore' });
    let childReady, grandReady;
    while (!(childReady = await json(c.root + '/ignore-child-ready.json').catch(() => null)) ||
           !(grandReady = await json(c.root + '/ignore-grandchild-ready.json').catch(() => null))) await sleep(5);
    const deadline = BigInt(c.t0Ns) + 5000000000n;
    const members = [await observed(c.probe, childReady.pid, deadline), await observed(c.probe, grandReady.pid, deadline)];
    if (members[0].ppid !== process.pid || members[1].ppid !== members[0].pid || members[0].pgid !== members[1].pgid || members[0].sid !== members[1].sid) throw Error('D3 lineage');
    await publish(c.root + '/d3-prerequisite.json', { members, beforeTermNs: String(clock()) });
    await marker({ kind: 'term-ignoring-child-grandchild-ready' }); setInterval(() => {}, 1000); return;
  }
  if (c.case === 'D11') { await marker({ kind: 'normal-worker-completed' }); return; }
  if (c.case === 'D6') {
    const { createServer, createConnection } = await import('node:net');
    const server = createServer(async socket => {
      socket.on('error', () => {});
      await marker({ kind: 'synthetic-owned-attachment-stall', actualConnectionAccepted: true, browserCompatibility: false });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    createConnection(server.address().port, '127.0.0.1').on('error', () => {}); return;
  }
  await publish(c.root + '/worker-ready.json', { pid: process.pid, monoNs: String(clock()) });
  setInterval(() => {}, 1000);
}
if (process.argv[1]?.endsWith('/fixture.mjs')) main(process.argv[2], process.argv[3]).then(async () => {
  const c = await json(process.argv[2]);
  if (c.case === 'D11') await publish(c.root + '/worker-returned.json', { pid: process.pid, returnedNs: String(clock()), expectedExitCode: 0 });
}).catch(e => { process.stderr.write(String(e.stack) + '\n'); process.exitCode = 70; });
