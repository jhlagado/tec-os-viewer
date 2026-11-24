import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { findVolume, parseContainer, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
import { card, power, recipeOn } from './lib/page.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pins = JSON.parse(readFileSync(new URL('../pins.json', import.meta.url), 'utf8'));
const bundled = readFileSync(new URL('../dist/files/TAS.COM', import.meta.url));
const expected = pins.files['TAS.COM'];
const limit = 800_000_000;

test('the bundled card TAS turns progress during Snake9 COM refusal and BIN assembly', { timeout: 300_000 }, async t => {
  const image = await card(recipeOn('MON3'));
  const v = findVolume(parseContainer(image), 'A');
  const drive = () => new CpmVolume(volumePayload(image, v), v.g);
  assert.equal(sha(bundled), expected);
  assert.equal(sha(drive().read('TAS.COM').subarray(0, bundled.length)), expected);
  const original = drive().read('SNAKE9.BIN');
  const m = power(image, 'pico', 40);
  m.runUntilChecked(() => m.ready() && /A:MON3>$/.test(m.text()), limit, 'boot');
  const invoke = command => {
    const out = m.command(command, { maxCycles: limit });
    const marks = [...out.matchAll(/([|/\\-])\x08/g)].map(mark => mark[1]);
    assert.ok(marks.length >= 4, 'all four spinner frames reach the console');
    assert.equal(marks.join(''), marks.map((_, i) => '|/-\\'[i % 4]).join(''));
    assert.match(out, / \x08/);
    t.diagnostic(JSON.stringify({ command, frames: marks.length, tas: expected }));
    return out;
  };
  const refusal = invoke('TAS SNAKE9.ASM');
  t.diagnostic(JSON.stringify({ refusal }));
  assert.match(refusal, /COM output selected\. COM must start at 0100H\./);
  assert.ok(!drive().list().some(f => f.name === 'SNAKE9.COM'));
  assert.deepEqual(drive().read('SNAKE9.BIN'), original);
  assert.match(invoke('TAS SNAKE9.ASM SNAKE9.BIN'), /SNAKE9.BIN written/);
  assert.deepEqual(drive().read('SNAKE9.BIN'), original, 'rebuilt BIN equals the shipped game including record padding');
  assert.deepEqual(m.violations, []);
});

test('the bundled TAS accepts bare END without stopping assembly and refuses an operand', { timeout: 120_000 }, async () => {
  const image = await card(recipeOn('MON3'));
  const v = findVolume(parseContainer(image), 'A');
  const drive = () => new CpmVolume(volumePayload(image, v), v.g, { readOnly: false });
  drive().write('ENDOK.ASM', Buffer.from('ORG 100H\n DB 1\n END\n DB 2\n'), { text: true });
  drive().write('ENDBAD.ASM', Buffer.from('ORG 100H\n RET\n END 100H\n'), { text: true });
  const m = power(image, 'pico', 40);
  m.runUntilChecked(() => m.ready() && /A:MON3>$/.test(m.text()), limit, 'boot');
  assert.match(m.command('TAS'), /usage: TAS INPUT\.ASM \[OUTPUT\.TYP\]/);
  assert.match(m.command('TAS ENDOK'), /ENDOK.COM written/);
  assert.deepEqual([...drive().read('ENDOK.COM').subarray(0, 2)], [1, 2]);
  assert.doesNotMatch(m.command('TAS ENDBAD'), /ENDBAD.COM written/);
  assert.ok(!drive().list().some(f => f.name === 'ENDBAD.COM'));
  assert.equal(m.read(m.sym('PRGCODE')) | (m.read(m.sym('PRGCODE') + 1) << 8), 0xff00);
  assert.deepEqual(m.violations, []);
});
