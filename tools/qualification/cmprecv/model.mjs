import {createHash} from 'node:crypto';

export class Rejection extends Error {
  constructor(code) { super(code); this.code = code; }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const widths = new Set(['32', '40', '80']);

// Failed writes preserve the saved value.
// The selected session width still applies.
export function width(storage, select) {
  const initial = readWidth(storage);
  let session = initial;
  let persisted = null;
  if (select !== undefined) {
    if (!widths.has(select)) throw new Rejection('WIDTH_SELECTION');
    session = select;
    try { storage.setItem('width', select); persisted = true; }
    catch { persisted = false; }
  }
  return {initial, session, selector: session, cardRequest: session,
    persisted, reload: readWidth(storage)};
}
function readWidth(storage) {
  try {
    const saved = storage.getItem('width');
    return widths.has(saved) ? saved : '40';
  } catch { return '40'; }
}

const prefix = '<details id="font-notices"><summary>Font notices</summary><pre>';
const suffix = '</pre></details>';

// Text nodes need only ampersand and angle
// bracket escaping. Quotes remain text.
export function serialize(text, format) {
  if (format !== 'directory' && format !== 'standalone') {
    throw new Rejection('NOTICE_FORMAT');
  }
  const escaped = text.replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {html: prefix + escaped + suffix,
    external: format === 'directory' ? text : null};
}

// Validate before producing either artifact.
export function notice(bytes, format) {
  if (bytes === null) throw new Rejection('NOTICE_MISSING');
  if (bytes.length !== 2642) throw new Rejection('NOTICE_LENGTH');
  if (sha(bytes) !== '577c3e97edcf1d7e183f4b668ec93a3125c90a414a6203fb3194ba6a6c612b41') {
    throw new Rejection('NOTICE_HASH');
  }
  return serialize(bytes.toString('utf8'), format);
}

// The order defines the first refusal.
// Body fixtures are not HTTP observations.
export function identity(actual, expected) {
  for (const [field, code] of [
    ['rom', 'IDENTITY_ROM'], ['font', 'IDENTITY_FONT'],
    ['dependency', 'IDENTITY_DEPENDENCY'], ['app', 'IDENTITY_APP'],
    ['recipe', 'IDENTITY_RECIPE'], ['notice', 'IDENTITY_NOTICE'],
  ]) {
    if (sha(actual[field]) !== expected[field]) throw new Rejection(code);
  }
  if (actual.picoVersion !== 3) throw new Rejection('IDENTITY_PICO_VERSION');
  return {matched: true, picoVersion: 3};
}
