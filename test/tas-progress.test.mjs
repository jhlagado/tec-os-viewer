import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findVolume, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { card, power } from './lib/page.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = '00e34db203603062c985c31ee53bdd21cb505281d388c8d64155d31cd9b6ccc4';
const limit = 800_000_000;

test('the bundled card TAS turns progress during Snake9 COM refusal and BIN assembly', { timeout: 300_000 }, async t => {
  const image = await card();
  const v = findVolume(parseContainer(image), 'A');
  const drive = () => new CpmVolume(volumePayload(image, v), v.g);
  assert.equal(sha(drive().read('TAS.COM').subarray(0, 11098)), expected);
  assert.equal(sha(readFileSync(new URL('../dist/files/TAS.COM', import.meta.url))), expected);
  const original = drive().read('SNAKE9.BIN');
  const m = power(image, 'pico', 40);
  m.runUntilChecked(() => m.ready() && /A:SYSTEM>$/.test(m.text()), limit, 'boot');
  const invoke = command => {
    const out = m.command(command, { maxCycles: limit });
    const marks = [...out.matchAll(/([|/\\-])\x08/g)].map(mark => mark[1]);
    assert.ok(marks.length >= 4, 'all four spinner frames reach the console');
    assert.equal(marks.join(''), marks.map((_, i) => '|/-\\'[i % 4]).join(''));
    assert.match(out, / \x08/);
    t.diagnostic(JSON.stringify({ command, frames: marks.length, tas: expected }));
    return out;
  };
  assert.match(invoke('TAS SNAKE9.ASM'), /Output must start at 0100H/i);
  assert.ok(!drive().list().some(f => f.name === 'SNAKE9.COM'));
  assert.deepEqual(drive().read('SNAKE9.BIN'), original);
  assert.match(invoke('TAS SNAKE9.ASM SNAKE9.BIN'), /SNAKE9.BIN written/);
  assert.deepEqual(drive().read('SNAKE9.BIN'), original, 'rebuilt BIN equals the shipped game including record padding');
  assert.deepEqual(m.violations, []);
});
