// Check the passive observer's complete ROM, symbol map and opcode binding.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const profile = JSON.parse(readFileSync(new URL('../src/guest-profile.json', import.meta.url)));
export function checkGuestProfile() {
  const raw = readFileSync(new URL('../tec-os/dist/tecos.d8.json', import.meta.url));
  const rom = readFileSync(new URL('../tec-os/dist/tecos.rom', import.meta.url));
  const symbols = Object.fromEntries(JSON.parse(raw).symbols
    .filter(s => typeof (s.address ?? s.value) === 'number')
    .map(s => [s.name.toUpperCase(), s.address ?? s.value]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (sha(raw) !== profile.d8 || sha(rom) !== profile.rom || sha(JSON.stringify(symbols)) !== profile.symbolMap) throw Error('guest observer ROM or symbol binding differs');
  for (const span of profile.spans) {
    const at = symbols[span.symbol] + span.offset - 0xc000;
    if (rom.subarray(at, at + span.bytes.length / 2).toString('hex') !== span.bytes) throw Error(`guest observer span differs: ${span.symbol}`);
  }
}
