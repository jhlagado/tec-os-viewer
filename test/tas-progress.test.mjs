import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findVolume, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { card, power } from './lib/page.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = 'e512c53fce2c6a69180abb4602186c98f9e2f46f8524296013ac7f8817f67add';
const limit = 800_000_000;

test('the bundled card TAS turns progress during Snake9 COM refusal and BIN assembly', { timeout: 300_000 }, async t => {
  const image = await card();
  const v = findVolume(parseContainer(image), 'A');
  const drive = () => new CpmVolume(volumePayload(image, v), v.g);
  assert.equal(sha(drive().read('TAS.COM').subarray(0, 11104)), expected);
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

test('the bundled TAS accepts bare END without stopping assembly and refuses an operand', { timeout: 120_000 }, async () => {
  const image = await card();
  const v = findVolume(parseContainer(image), 'A');
  const drive = () => new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  drive().write('ENDOK.ASM', Buffer.from('ORG 100H\n DB 1\n END\n DB 2\n'), { text: true });
  drive().write('ENDBAD.ASM', Buffer.from('ORG 100H\n RET\n END 100H\n'), { text: true });
  const m = power(image, 'pico', 40);
  m.runUntilChecked(() => m.ready() && /A:SYSTEM>$/.test(m.text()), limit, 'boot');
  assert.match(m.command('TAS ENDOK'), /ENDOK.COM written/);
  assert.deepEqual([...drive().read('ENDOK.COM').subarray(0, 2)], [1, 2]);
  assert.doesNotMatch(m.command('TAS ENDBAD'), /ENDBAD.COM written/);
  assert.ok(!drive().list().some(f => f.name === 'ENDBAD.COM'));
  assert.equal(m.read(m.sym('PRGCODE')) | (m.read(m.sym('PRGCODE') + 1) << 8), 0xff00);
  assert.deepEqual(m.violations, []);
});
