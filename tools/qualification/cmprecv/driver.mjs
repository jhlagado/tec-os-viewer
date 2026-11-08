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
let phase = 'entry';
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
  require(raw.length > 0 && raw.length <= cap, 'retention cap ' + name);
  // Complete each exclusive O_SYNC write.
  // The outer then flushes closed evidence.
  const bits = [fs.constants.O_TRUNC, fs.constants.O_CREAT, fs.constants.O_WRONLY,
    fs.constants.O_EXCL, fs.constants.O_SYNC];
  require(bits.every(n => Number.isInteger(n) && n > 0), 'Linux synchronous exclusive-create flags');
  const fd = fs.openSync(join(root, name), bits.reduce((flags, n) => flags | n, 0), 0o600);
  try {
    let offset = 0;
    while (offset < raw.length) {
      const count = fs.writeSync(fd, raw, offset, raw.length - offset);
      require(Number.isInteger(count) && count > 0 && count <= raw.length - offset,
        'synchronous output write made invalid progress');
      offset += count;
    }
  } finally { fs.closeSync(fd); }
  files.push({path: name, bytes: raw.length, sha256: sha(raw)});
}
function save(name, value, cap) { write(name, JSON.stringify(value) + '\n', cap); }
// Stream large providers in fixed blocks.
// Descriptor contrasts never alter a file.
const fileBlock = Buffer.alloc(65536);
function fileHash(path) {
  const hash = createHash('sha256');
  const block = fileBlock;
  const fd = fs.openSync(path, 'r');
  try {
    for (;;) {
      const count = fs.readSync(fd, block, 0, block.length, null);
      if (count === 0) break;
      hash.update(block.subarray(0, count));
    }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function verifyDependency(descriptor) {
  require(descriptor.kind === 'M0_HOST_DEPENDENCY_DESCRIPTOR' && descriptor.schemaVersion === 1,
    'structured dependency input');
  require(descriptor.provenance.viewerRevision === '628aeb221c53145a25f50f876c93c2c0cb6462ea' &&
    descriptor.provenance.gitlink === 'fe2097f4bad3f7578aa41b8bce8aa571c451dbc7', 'fixed source context');
  const roots = new Map(descriptor.roots.map(row => [row.id, row.path]));
  for (const row of descriptor.roots) {
    require(fs.lstatSync(row.path).isDirectory() && fs.realpathSync(row.path) === row.realpath,
      'actual resolved root ' + row.id);
  }
  const ids = new Set();
  for (const row of descriptor.resolvedFiles) {
    require(!ids.has(row.id), 'unique resolved file'); ids.add(row.id);
    const base = roots.get(row.root);
    require(base !== undefined && join(base, row.relative) === row.path &&
      row.relative !== '..' && !row.relative.startsWith('../'), 'declared resolved root');
    const st = fs.lstatSync(row.path);
    require(st.isFile() && fs.realpathSync(row.path) === row.realpath &&
      st.size === row.bytes && '0o' + (st.mode & 0o777).toString(8) === row.mode &&
      fileHash(row.path) === row.sha256, 'actual dependency file join ' + row.id);
  }
  for (const link of descriptor.hostBindings.symlinks) {
    require(fs.lstatSync(link.path).isSymbolicLink() && fs.readlinkSync(link.path) === link.target &&
      fs.realpathSync(link.path) === link.realpath, 'actual provider link');
  }
  for (const path of descriptor.hostBindings.absentPaths.concat(descriptor.packageMetadata.rootLockAbsences)) {
    try { fs.lstatSync(path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('absent dependency path appeared ' + path);
  }
  for (const tree of descriptor.hostBindings.closedTrees) {
    const files = []; const dirs = [];
    function walk(path, prefix) {
      for (const entry of fs.readdirSync(path, {withFileTypes: true})) {
        if (prefix === '' && tree.excludedTopDirectories?.includes(entry.name)) continue;
        const name = prefix + entry.name;
        if (entry.isDirectory()) { dirs.push(name); walk(join(path, entry.name), name + '/'); }
        else { require(entry.isFile(), 'plain scoped provider tree'); files.push(name); }
      }
    }
    require(fs.lstatSync(tree.path).isDirectory() && fs.realpathSync(tree.path) === tree.path, 'canonical provider tree root');
    walk(tree.path, '');
    require(JSON.stringify(files.sort()) === JSON.stringify([...tree.files].sort()) &&
      JSON.stringify(dirs.sort()) === JSON.stringify([...tree.directories].sort()), 'closed actual provider set');
  }
  for (const row of descriptor.provenance.viewerFiles) {
    const raw = fs.readFileSync(row.path);
    const gitBlob = createHash('sha1').update('blob ' + raw.length + '\0').update(raw).digest('hex');
    require(gitBlob === row.gitObject, 'complete Viewer baseline blob ' + row.path);
  }
  const guard = descriptor.guardProvenance;
  const guardBytes = fs.readFileSync(guard.path);
  const guardBlob = createHash('sha1').update('blob ' + guardBytes.length + '\0').update(guardBytes).digest('hex');
  require(guardBlob === guard.gitBlob && sha(guardBytes) === guard.sha256, 'immutable guard source blob');
  for (const item of descriptor.packageMetadata.copies) {
    require(fileHash(item.source) === item.sha256 && fileHash(join(here, item.copy)) === item.sha256,
      'actual package/lock copy');
  }
  return {descriptorSha256: sha(read('deps.dat')), actualFileJoins: descriptor.resolvedFiles.length,
    viewerFiles: descriptor.provenance.viewerFiles.length, hostOnly: true, browserInstallQualified: false};
}

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
  phase = 'source-staging';
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
    active = item.id; phase = 'width-case';
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
  active = 'notice-setup'; phase = 'notice-fixture';
  const canonical = read('inputs/notice.txt');
  require(canonical.length === oracle.noticeBytes && sha(canonical) === oracle.noticeSha256, 'canonical notice fixture');
  const noticeNames = {
    'directory-positive': ['dir.html', 'dir.txt'],
    'standalone-positive': ['one.html'],
    'directory-escaping': ['escdir.html', 'escdir.txt'],
    'standalone-escaping': ['escone.html'],
  };
  for (const item of cases.notices) {
    active = item.id; phase = 'notice-case';
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
  active = 'identity-setup'; phase = 'positive-dependency-file-joins';
  const dependencyRaw = read('deps.dat');
  require(sha(dependencyRaw) === offer.identityExpected.dependency &&
    sha(dependencyRaw) === oracle.dependencyDescriptorSha256, 'sealed positive dependency descriptor');
  const descriptor = JSON.parse(dependencyRaw);
  const expected = {...offer.identityExpected, dependency: JSON.parse(dependencyRaw)};
  const bodies = Object.fromEntries(Object.entries(offer.identityBodies)
    .filter(([key]) => key !== 'dependency').map(([key, path]) => [key, read(path)]));
  bodies.dependency = descriptor;
  bodies.picoVersion = 3;
  let positiveJoins = verifyDependency(descriptor);
  for (const item of cases.identities) {
    active = item.id;
    const spec = oracle.identityMutations[active];
    require(spec !== undefined, 'declared identity mutation');
    phase = 'positive-dependency-file-joins';
    if (spec.field === 'dependency') positiveJoins = verifyDependency(descriptor);
    phase = 'positive-identity-baseline';
    model.identity(bodies, expected);
    phase = 'identity-contrast';
    const altered = {...bodies};
    let originalRow = null; let alteredRow = null; let descriptorArtifact = null;
    if (spec.operation === 'replace-resolved-row-hash') {
      require(spec.field === 'dependency', 'dependency-only row mutation');
      altered.dependency = JSON.parse(dependencyRaw);
      const matches = altered.dependency.resolvedFiles.filter(row => row.id === spec.rowId);
      require(matches.length === 1 && matches[0].path === spec.path &&
        matches[0].sha256 === spec.originalSha256 && /^[0-9a-f]{64}$/.test(spec.alteredSha256) &&
        spec.alteredSha256 !== spec.originalSha256, 'named real resolved-file mutation');
      originalRow = {...matches[0]}; matches[0].sha256 = spec.alteredSha256; alteredRow = {...matches[0]};
      save('depnew.dat', altered.dependency, offer.caps.dependencyFile);
      descriptorArtifact = {...files.at(-1)};
    } else {
      altered[spec.field] = spec.operation === 'set-integer' ? spec.to : mutation(bodies[spec.field], spec);
    }
    const actual = negative(() => model.identity(altered, expected), spec.reason);
    record({id: active, family: 'identity', mutation: spec, actual, matched: true,
      actualHash: Buffer.isBuffer(altered[spec.field]) ? sha(altered[spec.field]) : null,
      observedPicoVersion: altered.picoVersion, originalRow, alteredRow, descriptorArtifact,
      positiveDependencyJoins: spec.field === 'dependency' ? positiveJoins : null});
  }
  active = 'retention'; phase = 'postflight';
  require(rows.length === 34, 'complete finite readings');
  checkSources();
  positiveJoins = verifyDependency(descriptor);
  save('readings.dat', {kind: 'M0_MODEL_READINGS', rows, total: 34}, offer.caps.readings);
  save('inputs.dat', {kind: 'M0_ACTUAL_SOURCE_IDENTITIES', sourceRows,
    identityExpected: offer.identityExpected, noticeBytes: canonical.length,
    noticeSha256: sha(canonical), fixtureBodiesAreHttpObservations: false}, offer.caps.identities);
  save('result.dat', {kind: 'M0_MODEL_RESULT_PENDING_REVIEW', total: 34, widths: 17, notices: 10, identities: 7,
    pid: process.pid, ppid: process.ppid, guardPid: Number(process.env.ORIGO_GUARD),
    argv: process.argv, execArgv: process.execArgv, environment: process.env,
    childDenied: true, dependencyJoins: positiveJoins, offerSha256: sha(rawOffer), nativeExecution: false,
    browserExecution: false, productionWitness: false, D: false, B: false, A5: false}, offer.caps.result);
  save('files.dat', {kind: 'M0_OUTPUT_INVENTORY', rows: [...files], excludesOnlySelf: 'files.dat'}, offer.caps.inventory);
  console.log(JSON.stringify({kind: 'M0_MODEL_COMPLETE', total: 34, pendingReview: true}));
} catch (error) {
  if (created) {
    save('failed.dat', {kind: 'M0_FIRST_FAILURE', active, phase, completed: rows.length,
      error: String(error).slice(0, 2048), retained: files}, offer.caps.failure);
  }
  throw error;
}
