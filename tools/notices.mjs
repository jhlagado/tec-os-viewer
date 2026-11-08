import {createHash} from 'node:crypto';

const digest = '577c3e97edcf1d7e183f4b668ec93a3125c90a414a6203fb3194ba6a6c612b41';
const prefix = '<details id="font-notices"><summary>Font notices</summary><pre>';
const suffix = '</pre></details>';

function refuse(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// Quotes remain text inside this pre.
// Escape ampersands before brackets.
export function serializeNotice(text, format) {
  if (format !== 'directory' && format !== 'standalone') {
    refuse('NOTICE_FORMAT');
  }
  if (typeof text !== 'string') refuse('NOTICE_TEXT');
  const escaped = text.replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    html: prefix + escaped + suffix,
    external: format === 'directory' ? Buffer.from(text, 'utf8') : null,
  };
}

// Authenticate bytes before conversion.
// Null explicitly means missing input.
export function validateNotice(bytes, format) {
  if (bytes === null) refuse('NOTICE_MISSING');
  if (!(bytes instanceof Uint8Array)) refuse('NOTICE_BYTES');
  if (bytes.byteLength !== 2642) refuse('NOTICE_LENGTH');
  const copy = Buffer.from(bytes);
  if (createHash('sha256').update(copy).digest('hex') !== digest) {
    refuse('NOTICE_HASH');
  }
  return serializeNotice(copy.toString('utf8'), format);
}
