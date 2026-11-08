import {createHash} from 'node:crypto';
import {readFileSync, openSync, writeSync, closeSync, constants} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateNotice, serializeNotice} from '../../notices.mjs';

const base = new URL('./', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fixtures = {
  'notice.txt': [2642, '577c3e97edcf1d7e183f4b668ec93a3125c90a414a6203fb3194ba6a6c612b41'],
  'canon.htm': [2721, 'ac8a35635e2b542335939a1813de2208cea79ec7ba2441e90f768be1f890de00'],
  'synt.htm': [113, 'b4dffb331487ff2278e06c40c181029f632e6fa6188f9d3db59a34aca9eafc8d'],
  'cases.dat': [1767, 'a559a7e81f47ec8f9eeecbbacb1c1284c6ab5cb89126e047f2cddd82728cf917'],
  'expect.dat': [1519, 'd7bc9acf51ee2068f47ae61f28135498697da09e13b68da9a7cb7050fb5ee2a0'],
};
const record = {
  kind: 'NS1_NS2_NS3_ISOLATED_OBSERVATIONS',
  runtimeAuthority: false,
  historicalM0Count: 10,
  prospectiveCount: 11,
  activeCase: 'setup', firstReason: null,
  fixtures: [], observations: [], complete: false,
};
function requireValue(ok, code) {
  if (!ok) throw Object.assign(new Error(code), {code});
}
function same(actual, expected, code) {
  requireValue(Buffer.from(actual).equals(Buffer.from(expected)), code);
}
function decode(html, prefix, suffix) {
  requireValue(html.startsWith(prefix) && html.endsWith(suffix), 'MARKUP');
  return html.slice(prefix.length, -suffix.length)
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}
function artifact(value, format, text, expectedHtml, expected) {
  same(value.html, expectedHtml, 'HTML_LITERAL');
  same(decode(value.html, expected.prefix, expected.suffix), text, 'ROUND_TRIP');
  if (format === 'directory') {
    requireValue(Buffer.isBuffer(value.external), 'EXTERNAL_TYPE');
    same(value.external, Buffer.from(text), 'EXTERNAL_LITERAL');
  } else requireValue(value.external === null, 'EXTERNAL_NOT_NULL');
  return {html: value.html,
    external: value.external === null ? null : value.external.toString('utf8')};
}

async function observe() {
  const data = {};
  for (const [name, [length, digest]] of Object.entries(fixtures)) {
    const bytes = readFileSync(new URL(name, base));
    requireValue(bytes.length === length && hash(bytes) === digest, 'FIXTURE_IDENTITY');
    data[name] = bytes;
    record.fixtures.push({name, bytes: bytes.length, sha256: hash(bytes)});
  }
  const cases = JSON.parse(data['cases.dat']);
  const expected = JSON.parse(data['expect.dat']);
  requireValue(cases.originalCases.length === 10 && expected.observationCount === 11,
    'CASE_COUNT');
  for (const test of cases.originalCases) {
    record.activeCase = test.id;
    const row = {id: test.id, matched: false};
    record.observations.push(row);
    if (test.mutation && test.mutation !== 'positive') {
      let input = null;
      if (test.mutation === 'truncated') input = data['notice.txt'].subarray(0, -1);
      else if (test.mutation === 'changed') {
        input = Buffer.from(data['notice.txt']); input[0] ^= 1;
      } else requireValue(test.mutation === 'missing', 'UNKNOWN_MUTATION');
      let returned = null;
      let rejection = null;
      try { returned = validateNotice(input, test.format); }
      catch (error) {
        if (error instanceof Error && typeof error.code === 'string') rejection = error.code;
        else throw error;
      }
      const reason = expected.noticeMutations[test.mutation].reason;
      Object.assign(row, {reason: rejection, artifact: returned});
      requireValue(rejection === reason && returned === null, 'REFUSAL_MISMATCH');
    } else {
      const synthetic = test.fixture !== undefined;
      const text = synthetic ? expected.syntheticText : data['notice.txt'].toString('utf8');
      const value = synthetic ? serializeNotice(text, test.format)
        : validateNotice(data['notice.txt'], test.format);
      Object.assign(row, {html: value.html,
        external: value.external === null ? null : value.external.toString('utf8')});
      Object.assign(row, artifact(value, test.format, text,
        data[synthetic ? 'synt.htm' : 'canon.htm'], expected));
    }
    row.matched = true;
  }

  // Mutate one source site, outside the API.
  // Keep the remaining serializer intact.
  record.activeCase = cases.additionalCase.id;
  const sourceBytes = readFileSync(new URL('../../notices.mjs', base));
  requireValue(sourceBytes.length <= 8192, 'SOURCE_BOUND');
  const source = sourceBytes.toString('utf8');
  const {from, to, occurrences} = expected.mutation;
  requireValue(occurrences === 1 && source.split(from).length === 2, 'MUTATION_SITE');
  const mutantSource = source.replace(from, to);
  const mutant = await import('data:text/javascript;base64,' +
    Buffer.from(mutantSource).toString('base64'));
  const value = mutant.serializeNotice(expected.syntheticText, 'standalone');
  const actual = Buffer.from(value.html);
  const oracle = data['synt.htm'];
  let firstMismatch = 0;
  while (firstMismatch < Math.min(actual.length, oracle.length) &&
      actual[firstMismatch] === oracle[firstMismatch]) firstMismatch++;
  const contrast = {id: record.activeCase, matched: false,
    firstMismatch, html: value.html, expectedHtml: oracle.toString('utf8'),
    external: value.external === null ? null : value.external.toString('utf8'),
    originalSourceSha256: hash(sourceBytes),
    mutantSourceSha256: hash(Buffer.from(mutantSource)), mutantSource};
  record.observations.push(contrast);
  same(actual, expected.mutantHtml, 'MUTANT_LITERAL');
  requireValue(actual.length === expected.mutantHtmlBytes &&
    hash(actual) === expected.mutantHtmlSha256 && !actual.equals(oracle) &&
    firstMismatch === expected.mutantFirstMismatch && value.external === null,
    'MUTANT_MISMATCH');
  Object.assign(contrast, {matched: true, reason: 'EXPECTED_LITERAL_MISMATCH'});
  requireValue(record.observations.length === 11, 'OBSERVATION_COUNT');
  record.complete = true;
}

// A later offer must seal this capture path.
// Existing output is never overwritten.
requireValue(process.argv.length === 3, 'ONE_OUTPUT_PATH_REQUIRED');
const output = resolve(process.argv[2]);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
requireValue(dirname(output) !== moduleDirectory, 'OUTPUT_IN_FIXTURES');
try { await observe(); }
catch (error) {
  record.firstReason = typeof error?.code === 'string' ? error.code : 'UNEXPECTED_EXCEPTION';
  record.error = String(error?.message ?? error).slice(0, 1024);
  process.exitCode = 1;
}
const bytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
requireValue(bytes.length <= 65536, 'CAPTURE_BOUND');
const bits = [constants.O_TRUNC, constants.O_CREAT, constants.O_WRONLY,
  constants.O_EXCL, constants.O_SYNC];
requireValue(bits.every(n => Number.isInteger(n) && n > 0), 'CAPTURE_SYNC_FLAGS');
const fd = openSync(output, bits.reduce((flags, n) => flags | n, 0), 0o600);
try {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    requireValue(Number.isInteger(written) && written > 0 &&
      written <= bytes.length - offset, 'CAPTURE_ZERO_WRITE');
    offset += written;
  }
} finally { closeSync(fd); }
