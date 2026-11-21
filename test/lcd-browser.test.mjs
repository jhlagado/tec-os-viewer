// Actual guest programs drive the LCD through MON3's RST 10h interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { card, web, DIST } from './lib/assets.mjs';
import { open, serve } from './lib/serve.mjs';
import { fromTecos } from './lib/root.mjs';
import { parseContainer, findVolume, volumePayload } from '../tec-os/tools/lib/container.mjs';
import { CpmVolume } from '../tec-os/tools/lib/cpmfs.mjs';
const { chromium } = fromTecos('playwright');
const sha = b => createHash('sha256').update(b).digest('hex');
const source = readFileSync(new URL('../tec-os/programs/SNAKE9.ASM', import.meta.url), 'utf8');
const font = new Map([...source.matchAll(/^\s*DB\s+"(.)",((?:\$[0-9A-F]{2},?){8})\s*$/gm)].map(m => [m[1], [...m[2].matchAll(/\$([0-9A-F]{2})/g)].map(v => parseInt(v[1], 16))]));
const inverse = name => [...name].map(c => font.get(c).map(v => v ^ 31));
async function fixture(t, image) {
  web(); const server = await serve(), url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); await new Promise(ok => server.close(ok)); });
  const opened = await open(browser, url, image, 'tms', 40);
  t.after(() => opened.context.close());
  await opened.page.waitForFunction(() => globalThis.tecos?.screen().some(l => l.trim() === 'A:SYSTEM>'));
  await opened.page.click('#tms'); await opened.page.keyboard.type('mon3\n');
  await opened.page.waitForFunction(() => globalThis.tecos?.screen().some(l => l.trim() === 'MON3>'));
  return opened;
}
async function load(page, name) {
  await page.keyboard.type(`load ${name}\n`);
  await page.waitForFunction(name => {
    const lines = globalThis.tecos.screen().map(l => l.trimEnd());
    return lines.some(l => l.toUpperCase().includes(`LOAD ${name}`)) && lines.filter(l => l.trim()).at(-1).trim() === 'MON3>';
  }, name);
  await page.keyboard.type('go\n');
}
async function cells(page, row, column, count) {
  return page.evaluate(({ row, column, count }) => {
    const canvas = document.getElementById('lcd');
    if (canvas.width !== 240 || canvas.height !== 72) throw Error('LCD pixel geometry differs');
    const d = canvas.getContext('2d').getImageData(0, 0, 240, 72).data;
    return Array.from({ length: count }, (_, cell) => Array.from({ length: 8 }, (_, y) => {
      let bits = 0;
      for (let x = 0; x < 5; x++) {
        const at = ((row * 18 + 1 + y * 2) * 240 + (column + cell) * 12 + 1 + x * 2) * 4;
        const p = [...d.slice(at, at + 4)];
        const on = p.join() === '28,42,6,255';
        if (!on && p.join() !== '159,194,58,255') throw Error('LCD colour differs');
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          if ([...d.slice(at + (dy * 240 + dx) * 4, at + (dy * 240 + dx) * 4 + 4)].join() !== p.join()) throw Error('LCD dot is not two by two');
        }
        bits = (bits << 1) | Number(on);
      }
      return bits;
    }));
  }, { row, column, count });
}
async function waitWord(page, row, column, name) {
  const expected = inverse(name);
  let actual;
  const until = Date.now() + 10000;
  do { actual = await cells(page, row, column, name.length); if (JSON.stringify(actual) === JSON.stringify(expected)) break; await page.waitForTimeout(20); } while (Date.now() < until);
  assert.deepEqual(actual, expected, `inverse ${name}`);
  return actual;
}
async function evidence(page, name, record) {
  const dir = process.env.TEST_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.locator('#lcd').screenshot({ path: join(dir, `${name}.png`) });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify({ ...record, scope: 'Actual guest through MON3 and real page keyboard, no guest-memory shortcuts.', build: JSON.parse(readFileSync(join(DIST, 'build.json'), 'utf8')), snakeSourceSha256: sha(source), shippedSnakeBinSha256: sha(readFileSync(new URL('../tec-os/dist/files/SNAKE9.BIN', import.meta.url))) }, null, 2) + '\n');
}

test('Snake9 settings render inverse labels and refresh unchanged custom codes', { timeout: 120000 }, async t => {
  const { page, errors } = await fixture(t, await card());
  await load(page, 'SNAKE9.BIN');
  await page.waitForFunction(() => document.getElementById('lcd').textContent.includes("Tutankhamen's Snake"));
  for (const label of ['A small snake fled', 'Keypad:', '7segs:', 'Speed:']) {
    await page.keyboard.press('Enter');
    await page.waitForFunction(label => document.getElementById('lcd').textContent.includes(label), label);
  }
  const elderly = await waitWord(page, 0, 7, 'ELDERLY');
  await page.waitForFunction(() => document.getElementById('lcd').textContent.includes('Longer is harder.'));
  const beforeText = await page.locator('#lcd').textContent();
  await evidence(page, 'snake-elderly', { label: 'ELDERLY', rows: elderly });
  await page.keyboard.press('ArrowUp');
  const midlife = await waitWord(page, 0, 7, 'MIDLIFE');
  await page.waitForFunction(() => document.getElementById('lcd').textContent.includes('Longer is harder.'));
  assert.equal(await page.locator('#lcd').textContent(), beforeText, 'accessible custom-cell placeholders unchanged; PUTNAME source supplies the code identity');
  assert.notDeepEqual(midlife, elderly);
  await page.keyboard.press('ArrowRight');
  await waitWord(page, 2, 8, 'ADDER');
  assert.ok((await page.locator('#lcd').textContent()).includes('MIDLIFE'));
  await page.keyboard.press('ArrowUp');
  const python = await waitWord(page, 2, 8, 'PYTHON');
  await evidence(page, 'snake-python', { label: 'PYTHON', rows: python });
  assert.deepEqual(errors, []);
});

function cursorProgram() {
  const b = [];
  const command = n => b.push(0x06, n, 0x0e, 15, 0xd7);
  const data = n => b.push(0x3e, n, 0x0e, 14, 0xd7);
  command(1); command(0x40);
  for (const n of [0,31,0,31,0,31,0,31]) data(n);
  command(0x80); data(0); command(0x80); command(0x0f);
  const loop = 0x4000 + b.length; b.push(0xc3, loop & 255, loop >> 8);
  return Uint8Array.from(b);
}
test('LCD cursor block continues blinking after CPU pause and reset replaces its state', { timeout: 120000 }, async t => {
  const image = await card(), a = findVolume(parseContainer(image), 'A');
  new CpmVolume(volumePayload(image, a), a.g, { readOnly: false }).write('LCDPROBE.BIN', cursorProgram());
  const { page, errors } = await fixture(t, image);
  await load(page, 'LCDPROBE.BIN');
  await page.waitForFunction(() => document.getElementById('lcd').textContent.startsWith('\ufffc'));
  await page.click('#pause'); assert.equal(await page.locator('#pause').textContent(), 'Run');
  const phase = on => page.waitForFunction(on => {
    const d = document.getElementById('lcd').getContext('2d').getImageData(1, 1, 1, 1).data;
    return [...d].join() === (on ? '28,42,6,255' : '159,194,58,255');
  }, on, { timeout: 3000 });
  await phase(false); await phase(true);
  await evidence(page, 'lcd-paused-cursor', { cpuPaused: true, observedGlyphAndBlockPhases: true, programSha256: sha(cursorProgram()) });
  await page.click('#reset');
  await page.waitForFunction(() => !document.getElementById('lcd').textContent.includes('\ufffc'));
  assert.equal(await page.locator('#pause').textContent(), 'Run');
  assert.deepEqual(errors, []);
});
