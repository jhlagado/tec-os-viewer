// Source-sealed Node guard entry. Self-stop is not a foreign-PID signal.
import { json, publish, observed, sleep } from './harness-lib.mjs';
export async function main(configPath) {
  const c = await json(configPath), end = BigInt(c.t0Ns) + BigInt(c.policy === 'synthetic' ? 5 : 120) * 1000000000n;
  const identity = await observed(c.probe, process.pid, end);
  await publish(c.root + '/guard-entry.json', { identity });
  process.kill(process.pid, 'SIGSTOP');
  const argv = await json(c.root + '/guard-argv.json');
  process.argv = argv;
  const trust = await json(c.root + '/test-authority-location.json');
  process.env.P6_PROTOTYPE_TEST_AUTHORITY = trust.path;
  process.env.P6_PROTOTYPE_TEST_AUTHORITY_SHA256 = trust.sha256;
  await import(new URL('./mem-guard.prototype.mjs', import.meta.url));
}
if (process.argv[1]?.endsWith('/guard-entry.mjs')) main(process.argv[2]).catch(e => { process.stderr.write(String(e.stack) + '\n'); process.exitCode = 70; });
