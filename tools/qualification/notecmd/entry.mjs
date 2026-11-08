// Check context before adapter import.
// The outer owns final durable evidence.
import * as fs from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const offerPath = join(here, 'offer.dat');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const need = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const block = Buffer.alloc(65536);
let offer;
let phase = 'entry';
let importStarted = false;
let importReturned = false;
let contextHash = null;

function bounded(path, cap) {
  const before = fs.lstatSync(path, {bigint: true});
  need(before.isFile() && before.nlink === 1n && before.size <= BigInt(cap),
    'bounded regular input');
  const raw = fs.readFileSync(path);
  const after = fs.lstatSync(path, {bigint: true});
  need(BigInt(raw.length) === before.size && before.dev === after.dev &&
    before.ino === after.ino && before.size === after.size &&
    before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs,
    'stable complete input');
  return raw;
}

// Keep inode values as decimal strings.
// Linux may exceed Number's exact range.
function directory(path) {
  const st = fs.lstatSync(path, {bigint: true});
  need(st.isDirectory() && fs.realpathSync(path) === path,
    'plain canonical parent');
  return {path, realpath: path, device: String(st.dev), inode: String(st.ino),
    mode: '0o' + (st.mode & 0o777n).toString(8), uid: String(st.uid), gid: String(st.gid)};
}

function parents() {
  for (const expected of offer.parents) {
    need(same(directory(expected.path), expected), 'exact parent identity');
  }
  return directory(offer.work);
}

function source(row) {
  const st = fs.lstatSync(row.path, {bigint: true});
  need(st.isFile() && st.nlink === 1n && fs.realpathSync(row.path) === row.realpath &&
    st.size === BigInt(row.bytes) && '0o' + (st.mode & 0o777n).toString(8) === row.mode,
    'source metadata ' + row.path);
  const fd = fs.openSync(row.path, 'r');
  const h = createHash('sha256');
  let bytes = 0;
  try {
    const opened = fs.fstatSync(fd, {bigint: true});
    need(st.dev === opened.dev && st.ino === opened.ino, 'opened source identity');
    for (;;) {
      const n = fs.readSync(fd, block, 0, block.length, null);
      if (n === 0) break;
      bytes += n;
      need(bytes <= row.bytes, 'source grew');
      h.update(block.subarray(0, n));
    }
    const after = fs.fstatSync(fd, {bigint: true});
    need(st.dev === after.dev && st.ino === after.ino && st.size === after.size &&
      st.mtimeNs === after.mtimeNs && st.ctimeNs === after.ctimeNs,
      'source descriptor remained stable');
  } finally { fs.closeSync(fd); }
  const after = fs.lstatSync(row.path, {bigint: true});
  need(st.dev === after.dev && st.ino === after.ino && st.size === after.size &&
    st.mtimeNs === after.mtimeNs && st.ctimeNs === after.ctimeNs &&
    bytes === row.bytes && h.digest('hex') === row.sha256, 'source bytes ' + row.path);
}

function checkSources(raw) {
  const own = fs.lstatSync(offerPath, {bigint: true});
  need(own.isFile() && own.nlink === 1n && (own.mode & 0o777n) === 0o644n &&
    fs.realpathSync(offerPath) === offerPath, 'maintained offer identity');
  need(offer.sourceRows.length === 13, 'thirteen non-offer source rows');
  for (const tree of [offer.closedSourceDirectory, offer.closedComponentDirectory]) {
    need(same(fs.readdirSync(tree.path).sort(), [...tree.files].sort()), 'closed source names');
  }
  for (const row of offer.sourceRows) source(row);
  need(sha(bounded(offerPath, 2097152)) === sha(raw), 'offer unchanged');
  source(offer.nodeIdentity);
  for (const path of offer.packageAbsences) {
    try { fs.lstatSync(path); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('package absence changed');
  }
  return 14;
}

// Permission mode does not support fsync.
// Use the qualified public O_SYNC path.
function put(name, value, cap) {
  const raw = Buffer.from(JSON.stringify(value) + '\n');
  need(raw.length > 0 && raw.length <= cap, 'bounded context capture');
  const bits = [fs.constants.O_TRUNC, fs.constants.O_CREAT, fs.constants.O_WRONLY,
    fs.constants.O_EXCL, fs.constants.O_SYNC];
  need(bits.every(n => Number.isInteger(n) && n > 0), 'synchronous exclusive flags');
  const fd = fs.openSync(join(offer.work, name), bits.reduce((a, b) => a | b, 0), 0o600);
  try {
    let offset = 0;
    while (offset < raw.length) {
      const n = fs.writeSync(fd, raw, offset, raw.length - offset);
      need(Number.isInteger(n) && n > 0 && n <= raw.length - offset,
        'complete context write');
      offset += n;
    }
  } finally { fs.closeSync(fd); }
  return sha(raw);
}

try {
  const raw = bounded(offerPath, 2097152);
  offer = JSON.parse(raw);
  need(offer.state === 'SOURCE_ONLY_UNRUN_NOT_ALLOCATED' &&
    offer.runtimeAuthority === false && offer.allocationIssued === false,
    'inactive source offer');
  need(process.permission?.has('child') === false, 'effective child denial');
  need(same(process.argv, offer.leafProcessArgv) && same(process.execArgv, offer.nodeFlags) &&
    fs.realpathSync(process.execPath) === offer.nodeIdentity.realpath &&
    process.cwd() === offer.cwd, 'exact Node invocation');
  need(process.env.NOTICE_OFFER_SHA === sha(raw) &&
    process.env.NODE_OPTIONS === '--max-old-space-size=64' &&
    /^[1-9][0-9]*$/.test(process.env.ORIGO_GUARD ?? '') &&
    Number(process.env.ORIGO_GUARD) === process.ppid, 'actual offer and guard parent');
  const expectedEnv = {...offer.environment, NOTICE_OFFER_SHA: sha(raw),
    ORIGO_GUARD: String(process.ppid), NODE_OPTIONS: '--max-old-space-size=64'};
  need(same(Object.keys(process.env).sort(), Object.keys(expectedEnv).sort()) &&
    Object.entries(expectedEnv).every(([k, v]) => process.env[k] === v), 'closed Node environment');
  const parent = parents();
  const checked = checkSources(raw);
  const helper = bounded(offer.helper.path, offer.helper.bytes);
  need(sha(helper) === offer.helper.sha256, 'helper identity');
  const text = helper.toString('utf8');
  need(text.split(offer.mutation.from).length === 2, 'unique source mutation');
  const derived = text.replace(offer.mutation.from, offer.mutation.to);
  const specifier = 'data:text/javascript;base64,' + Buffer.from(derived).toString('base64');
  need(derived === offer.generated.source && sha(Buffer.from(derived)) === offer.generated.sourceSha256 &&
    specifier === offer.generated.literalUrl && sha(Buffer.from(specifier)) === offer.generated.urlSha256,
    'exact generated module identity');
  phase = 'context';
  const context = {kind: 'NOTICE_SOURCE_CONTEXT', pid: process.pid, ppid: process.ppid,
    guardPid: process.ppid, executable: fs.realpathSync(process.execPath), argv: process.argv,
    execArgv: process.execArgv, environment: process.env, cwd: process.cwd(), offerSha256: sha(raw),
    childDenied: true, filesystemSandboxClaimed: false, sourceChecks: checked, workParent: parent,
    generatedSourceSha256: offer.generated.sourceSha256, generatedUrlSha256: offer.generated.urlSha256,
    nativeExecution: false, browserExecution: false, productAcceptance: false};
  contextHash = put('context.dat', context, 8192);
  phase = 'adapter-import';
  importStarted = true;
  await import(pathToFileURL(offer.adapter).href);
  importReturned = true;
  phase = 'postflight';
  need(same(parents(), parent) && checkSources(raw) === checked, 'post-import source and parent');
  const exitCode = process.exitCode ?? 0;
  put('ended.dat', {kind: 'NOTICE_ADAPTER_IMPORT_RETURNED', pid: process.pid, ppid: process.ppid,
    guardPid: process.ppid, contextSha256: contextHash, offerSha256: sha(raw), adapterImportCompleted: true,
    sourcePostflightComplete: true, exitCode, interpreterShutdownPending: true,
    captureParentFsyncClaimed: false, nativeExecution: false, productAcceptance: false}, 4096);
  need(exitCode === 0, 'ADAPTER_NONZERO');
  const marker = JSON.stringify({kind: 'NOTICE_ADAPTER_RETURNED', pid: process.pid, ppid: process.ppid,
    guardPid: process.ppid, adapterImportCompleted: true, exitCode: 0, interpreterShutdownPending: true});
  need(Buffer.byteLength(marker + '\n') <= 512, 'bounded marker');
  console.log(marker);
} catch (error) {
  if (offer) {
    try {
      put('failed.dat', {kind: 'NOTICE_FIRST_FAILURE', phase, pid: process.pid, ppid: process.ppid,
        contextSha256: contextHash, adapterImportStarted: importStarted, adapterImportReturned: importReturned,
        name: String(error?.name ?? ''), code: String(error?.code ?? ''),
        message: String(error?.message ?? error).slice(0, 1024), stack: String(error?.stack ?? '').slice(0, 8192),
        completeObservationClaimed: false, nativeExecution: false, productAcceptance: false}, 16384);
    } catch (retentionError) { console.error(retentionError); }
  }
  console.error(error);
  process.exitCode = 1;
}
