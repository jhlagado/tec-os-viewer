import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const require = (ok, message) => { if (!ok) throw new Error(message); };
const rawOffer = fs.readFileSync(join(here, 'offer.dat'));
const offer = JSON.parse(rawOffer);
const rows = [];
const files = [];
let active = 'setup';
let created = false;

// Deny child creation before model import.
// This does not restrict filesystem access.
require(process.permission?.has('child') === false, 'effective child denial');
require(process.argv.length === 2 && process.argv[1] === join(here, 'driver.mjs'), 'fixed driver argv');
require(JSON.stringify(process.execArgv) === JSON.stringify(offer.nodeFlags), 'fixed Node flags');
require(process.env.M0_OFFER_SHA === sha(rawOffer), 'actual allocation offer hash');
require(/^\d+$/.test(process.env.ORIGO_GUARD ?? '') && Number(process.env.ORIGO_GUARD) === process.ppid && process.ppid > 1,
  'actual direct guard parent');
require(process.env.NODE_OPTIONS === '--max-old-space-size=64', 'guard heap environment');
const envKeys = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'M0_OFFER_SHA', 'ORIGO_GUARD', 'NODE_OPTIONS'];
require(JSON.stringify(Object.keys(process.env).sort()) === JSON.stringify(envKeys.sort()), 'closed child environment');
for (const [key, value] of Object.entries(offer.environment)) require(process.env[key] === value, 'base environment ' + key);
const root = offer.work;
const sourceRows = [...offer.sourceRows, {path: 'offer.dat', bytes: rawOffer.length, sha256: sha(rawOffer)}];
function read(name) { return fs.readFileSync(join(here, name)); }
function checkSources() {
  for (const item of sourceRows) {
    const path = join(here, item.path);
    const st = fs.lstatSync(path);
    require(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && (st.mode & 0o777) === 0o644,
      'maintained regular 0644 input ' + item.path);
    require(st.size === item.bytes && sha(read(item.path)) === item.sha256, 'source input changed ' + item.path);
  }
}
function write(name, bytes, cap) {
  const raw = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  require(raw.length <= cap, 'retention cap ' + name);
  const fd = fs.openSync(join(root, name), 'wx', 0o600);
  try { fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  files.push({path: name, bytes: raw.length, sha256: sha(raw)});
}
function save(name, value, cap) { write(name, JSON.stringify(value) + '\n', cap); }
function mutation(bytes, spec) {
  if (spec.operation === 'null') return null;
  if (spec.operation === 'remove-final-byte') return bytes.subarray(0, bytes.length - 1);
  require(spec.operation === 'xor-byte' && spec.offset === 0 && spec.xor === 1, 'fixed one-byte mutation');
  const changed = Buffer.from(bytes);
  changed[spec.offset] ^= spec.xor;
  return changed;
}
function decode(html, oracle) {
  require(html.startsWith(oracle.prefix) && html.endsWith(oracle.suffix), 'exact wrapper');
  const inner = html.slice(oracle.prefix.length, -oracle.suffix.length);
  require(!inner.includes('<') && !inner.includes('>'), 'text-only escaped body');
  return inner.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}
try {
  checkSources();
  const cases = JSON.parse(read('cases.dat')).hostCases;
  const oracle = JSON.parse(read('oracles.dat'));
  require(cases.widths.length === 17 && cases.notices.length === 10 && cases.identities.length === 7 && cases.total === 34,
    'unchanged finite case family');
  require(!fs.existsSync(root), 'fresh model output');
  fs.mkdirSync(root, {mode: 0o700}); created = true;
  for (const name of ['source', 'source/inputs', 'readings', 'notice']) fs.mkdirSync(join(root, name), {mode: 0o700});
  for (const item of sourceRows) write('source/' + item.path, read(item.path), offer.caps.sourceFile);
  const model = await import('./model.mjs');
  function negative(call, code) {
    try { call(); }
    catch (error) {
      require(error instanceof model.Rejection && error.code === code, 'specific first refusal ' + code);
      return {rejected: true, firstReason: error.code};
    }
    throw new Error('expected specific refusal ' + code);
  }
  function record(row) {
    rows.push(row);
    save('readings/c' + String(rows.length).padStart(2, '0') + '.dat', row, offer.caps.caseFile);
  }
  for (const item of cases.widths) {
    active = item.id;
    let stored = item.get === 'null' || item.get === 'throws' ? null : item.get;
    const storage = {
      getItem() { if (item.get === 'throws') throw new Error('fixture read unavailable'); return stored; },
      setItem(_key, value) { if (item.set === 'throws') throw new Error('fixture write unavailable'); stored = value; },
    };
    const actual = model.width(storage, item.select);
    require(actual.initial === item.expectedInitial, active + ' initial');
    const selected = item.expectedSession ?? item.expectedInitial;
    require(actual.session === selected && actual.selector === selected && actual.cardRequest === selected, active + ' session/selector/card request');
    if (item.select !== undefined) {
      require(stored === item.expectedStored && actual.reload === item.expectedReload &&
        actual.persisted === (item.persistenceClaim ?? true), active + ' saved/reload/persistence');
    }
    record({id: active, family: 'width', actual: {...actual, stored}, declared: item, matched: true});
  }
  active = 'notice-setup';
  const canonical = read('inputs/notice.txt');
  require(canonical.length === oracle.noticeBytes && sha(canonical) === oracle.noticeSha256, 'canonical notice fixture');
  const noticeNames = {
    'directory-positive': ['dir.html', 'dir.txt'],
    'standalone-positive': ['one.html'],
    'directory-escaping': ['escdir.html', 'escdir.txt'],
    'standalone-escaping': ['escone.html'],
  };
  for (const item of cases.notices) {
    active = item.id;
    const spec = oracle.noticeMutations[item.mutation];
    if (spec) {
      const actual = negative(() => model.notice(mutation(canonical, spec), item.format), spec.reason);
      record({id: active, family: 'notice', mutation: spec, actual, artifacts: [], matched: true});
      continue;
    }
    const synthetic = item.fixture !== undefined;
    const text = synthetic ? oracle.syntheticText : canonical.toString('utf8');
    const actual = synthetic ? model.serialize(text, item.format) : model.notice(canonical, item.format);
    const expectedHtml = synthetic ? oracle.syntheticHtml : oracle.prefix + text + oracle.suffix;
    require(actual.html === expectedHtml && decode(actual.html, oracle) === text &&
      actual.external === (item.format === 'directory' ? text : null), active + ' exact serialization and decoded text');
    const names = noticeNames[active];
    require(names !== undefined, 'declared positive notice path');
    write('notice/' + names[0], actual.html, offer.caps.noticeFile);
    if (names.length === 2) write('notice/' + names[1], actual.external, offer.caps.noticeFile);
    record({id: active, family: 'notice', synthetic, actual,
      decodedText: decode(actual.html, oracle), artifacts: names.map(name => 'notice/' + name), matched: true});
  }
  active = 'identity-setup';
  const bodies = Object.fromEntries(Object.entries(offer.identityBodies).map(([key, path]) => [key, read(path)]));
  bodies.picoVersion = 3;
  for (const item of cases.identities) {
    model.identity(bodies, offer.identityExpected);
    active = item.id;
    const spec = oracle.identityMutations[active];
    require(spec !== undefined, 'declared identity mutation');
    const altered = {...bodies};
    altered[spec.field] = spec.operation === 'set-integer' ? spec.to : mutation(bodies[spec.field], spec);
    const actual = negative(() => model.identity(altered, offer.identityExpected), spec.reason);
    record({id: active, family: 'identity', mutation: spec, actual, matched: true,
      actualHash: Buffer.isBuffer(altered[spec.field]) ? sha(altered[spec.field]) : null,
      observedPicoVersion: altered.picoVersion});
  }
  active = 'retention';
  require(rows.length === 34, 'complete finite readings');
  checkSources();
  save('readings.dat', {kind: 'M0_MODEL_READINGS', rows, total: 34}, offer.caps.readings);
  save('inputs.dat', {kind: 'M0_ACTUAL_SOURCE_IDENTITIES', sourceRows,
    identityExpected: offer.identityExpected, noticeBytes: canonical.length,
    noticeSha256: sha(canonical), fixtureBodiesAreHttpObservations: false}, offer.caps.identities);
  save('result.dat', {kind: 'M0_MODEL_RESULT_PENDING_REVIEW', total: 34, widths: 17, notices: 10, identities: 7,
    pid: process.pid, ppid: process.ppid, guardPid: Number(process.env.ORIGO_GUARD),
    argv: process.argv, execArgv: process.execArgv, environment: process.env,
    childDenied: true, offerSha256: sha(rawOffer), nativeExecution: false,
    browserExecution: false, productionWitness: false, D: false, B: false, A5: false}, offer.caps.result);
  save('files.dat', {kind: 'M0_OUTPUT_INVENTORY', rows: [...files], excludesOnlySelf: 'files.dat'}, offer.caps.inventory);
  console.log(JSON.stringify({kind: 'M0_MODEL_COMPLETE', total: 34, pendingReview: true}));
} catch (error) {
  if (created) {
    save('failed.dat', {kind: 'M0_FIRST_FAILURE', active, completed: rows.length,
      error: String(error).slice(0, 2048), retained: files}, offer.caps.failure);
  }
  throw error;
}
