// Broker-owned, non-forking verifier. No numeric signalling interface.
import { readFile } from 'node:fs/promises';
import { verify } from 'node:crypto';
import { canonical, sha, json } from './harness-lib.mjs';
export async function main(expectedPath, configPath) {
  const expected = await json(expectedPath), c = await json(configPath);
  for (const role of ['supervisor', 'watchdog']) {
    const ref = expected.bundle[role];
    if (!/^[0-9a-f]{64}$/.test(ref)) throw Error('ack digest');
    const raw = await readFile(c.root + '/receipts/' + ref + '.json');
    if (sha(raw) !== ref) throw Error('ack content hash');
    const { body, signature } = JSON.parse(raw);
    if (!verify(null, Buffer.from(canonical(body)), c.publicKeys[role], Buffer.from(signature, 'base64'))) throw Error('ack signature');
    if (body.kind !== 'controlled-transition' || body.role !== role || body.runId !== c.runId ||
        body.token !== expected.token || body.generation !== expected.generation ||
        body.phase !== expected.phase || canonical(body.anchorBirth) !== canonical(expected.anchorBirth) ||
        body.plannedGroup !== expected.anchorBirth[0] ||
        body.planSha256 !== expected.planSha256 ||
        body.publication !== 'FSYNCED_IMMUTABLE' ||
        BigInt(body.deadlineNs) !== BigInt(c.t0Ns) + BigInt(c.policy === 'synthetic' ? 5 : 120) * 1000000000n ||
        process.hrtime.bigint() >= BigInt(body.deadlineNs)) throw Error('transition generation/birth/deadline');
  }
}
if (process.argv[1]?.endsWith('/ack-check.mjs')) main(process.argv[2], process.argv[3]).catch(e => { process.stderr.write(String(e) + '\n'); process.exitCode = 70; });
