#!/usr/bin/env node
// Runs one heavy job on this machine, held to a memory limit. It waits for the
// machine's one heavy lock, runs the command in its own process group, reads the
// whole tree's memory five times a second, and kills the tree if the total passes
// the limit. It prints the peak and the elapsed time and appends both to a log.
// A peak is the highest reading, so it is a lower bound: what rises and falls
// between readings is not seen, and a job under 200 ms may not be read at all.
//
//   node mem-guard.mjs [--limit MB] [--heap MB] [--name NAME] [--log FILE]
//                      [--lock FILE] [--wait SECONDS] -- COMMAND [ARG ...]
//
// --limit  the tree's total, default 1024. A process counts its larger of resident
//          memory and, on macOS, its footprint, which holds what was compressed
//          and which resident memory leaves out.
// --heap   node's heap limit for every node in the tree, default three quarters
//          of the limit. Typed arrays sit outside it, so the guard is what counts.
// --name   who holds the lock and what the log calls this job, default the command.
// --log    JSON lines, one at the start and one at the end, default mem-guard.log.
//          Paths in the command are cut to their last part, so the log can be
//          pushed.
// --lock   default ~/.origo/heavy.lock, for every study on this machine. Waiters
//          take their turn, first come first served, by a ticket each in
//          heavy.lock.queue beside it; a dead waiter's ticket is passed over.
// --wait   give up after this long with exit 75; the default waits for ever.
//
// The exit code is the command's. 137 means the limit was passed, 75 no lock in
// time, 70 a guard inside a guard, 64 a bad flag, 69 no ps to read. A lock is free once its guard and the guard's
// process group are both gone; a guard killed outright can leave its job running,
// and that job then holds the lock until it ends.
//
// No dependencies, node 18 or later.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, loadavg } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
if (split < 0 || split === argv.length - 1) { console.error("usage: mem-guard.mjs [--limit MB] [--heap MB] [--name NAME] [--log FILE] [--lock FILE] [--wait SECONDS] -- COMMAND [ARG ...]"); process.exit(64); }
const flags = argv.slice(0, split), command = argv.slice(split + 1);
const opt = (k, d) => { const i = flags.indexOf(k); return i < 0 ? d : flags[i + 1]; };
const limit = Number(opt("--limit", 1024));
const heap = Number(opt("--heap", Math.floor(limit * 0.75)));
const name = opt("--name", command.map((a) => basename(a)).join(" "));
const logFile = resolve(opt("--log", "mem-guard.log"));
const lockFile = resolve(opt("--lock", join(homedir(), ".origo", "heavy.lock")));
const wait = opt("--wait", null);
const POLL = 200, SAY = 30000, MB = 1024;
if (!(limit > 0) || !(heap > 0) || (wait !== null && !(Number(wait) >= 0))) { console.error("mem-guard: --limit, --heap and --wait take numbers"); process.exit(64); }

process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
if (process.env.ORIGO_GUARD) { console.error(`mem-guard: already inside guard ${process.env.ORIGO_GUARD}; one guard for one job`); process.exit(70); }

const now = () => new Date().toTimeString().slice(0, 8);
const say = (s) => { try { console.log(`mem-guard ${now()} ${s}`); } catch {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shown = (a) => a.replace(/[^\s=:]*\//g, "");
const log = (o) => { mkdirSync(dirname(logFile), { recursive: true }); appendFileSync(logFile, JSON.stringify({ name, command: command.map(shown).join(" "), limitMB: limit, heapMB: heap, ...o }) + "\n"); };
// A process's start time, "" if it is gone. Null where ps can't be read, which
// says nothing of the process: memory starvation is when a spawn can fail.
const started = (pid) => { const r = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }); return r.error || r.status > 1 ? null : r.stdout.trim(); };
const freePercent = () => { const r = spawnSync("sysctl", ["-n", "kern.memorystatus_level"], { encoding: "utf8" }); return r.status === 0 ? Number(r.stdout) : null; };
const table = () => { const r = spawnSync("ps", ["-axo", "pid=,ppid=,pgid=,rss="], { encoding: "utf8" }); return r.error || r.status ? null : r.stdout.trim().split("\n").map((l) => { const [pid, ppid, pgid, rss] = l.trim().split(/\s+/).map(Number); return { pid, ppid, pgid, rss }; }); };

// A process's footprint, in KB, or 0 where the machine has no such reading.
const footprint = (pid) => {
  if (process.platform !== "darwin") return 0;
  const m = /phys_footprint:\s+([\d.]+)\s+(KB|MB|GB)/.exec(spawnSync("footprint", ["-p", String(pid)], { encoding: "utf8" }).stdout ?? "");
  return m ? Math.round(Number(m[1]) * { KB: 1, MB: MB, GB: MB * MB }[m[2]]) : 0;
};

// The tree under a process, with anything left in its group.
const tree = (root) => {
  const all = table() ?? [], kept = new Set([root]);
  for (let grew = true; grew;) { grew = false; for (const p of all) if (!kept.has(p.pid) && (kept.has(p.ppid) || p.pgid === root)) { kept.add(p.pid); grew = true; } }
  return all.filter((p) => kept.has(p.pid));
};
const groupAlive = (pgid) => { const all = table(); return !all || all.some((p) => p.pgid === pgid); };

// The lock holds {pid, started, group, name, since}. It is free when that guard
// is gone, the same pid with a later start being another process, and so is its
// group.
const readLock = () => { try { return JSON.parse(readFileSync(lockFile, "utf8")); } catch { return null; } };
const guardAlive = (l) => { const s = started(l.pid); return s === null || s === l.started; };
const holds = (l) => guardAlive(l) || (l.group ? groupAlive(l.group) : false);
const born = started(process.pid);
if (!born) { console.error("mem-guard: ps can't be read, so nothing can be guarded"); process.exit(69); }
const me = { pid: process.pid, started: born, group: 0, name, cwd: process.cwd(), since: new Date().toISOString() };
const writeTemp = (o) => { const t = `${lockFile}.${process.pid}`; writeFileSync(t, JSON.stringify(o) + "\n"); return t; };

// A file made whole, then linked in: the link is the atomic step.
const tryLock = () => {
  const t = writeTemp(me);
  try { linkSync(t, lockFile); return true; } catch (e) { if (e.code !== "EEXIST") throw e; return false; } finally { rmSync(t, { force: true }); }
};

// Only one guard at a time may look at a dead lock and remove it, or a second could
// remove the lock the first has since taken.
const clearDead = () => {
  const gate = `${lockFile}.clearing`;
  try { if (Date.now() - statSync(gate).mtimeMs > 10000) rmdirSync(gate); } catch {}
  try { mkdirSync(gate); } catch { return; }
  try {
    const l = readLock();
    if (l && !holds(l)) { rmSync(lockFile, { force: true }); say(`took over the lock of ${l.name}, pid ${l.pid}, which has died`); }
  } finally { rmdirSync(gate); }
};

// A waiter's ticket is named by its arrival, so names sort first come first. A
// ticket whose guard has died is removed by whoever reads it.
const queue = `${lockFile}.queue`;
const ticketName = `${String(Date.now()).padStart(15, "0")}-${String(process.pid).padStart(7, "0")}.json`;
const ticket = join(queue, ticketName);
const takeTicket = () => { mkdirSync(queue, { recursive: true }); renameSync(writeTemp(me), ticket); };
const dropTicket = () => rmSync(ticket, { force: true });
const ahead = () => {
  const live = [];
  for (const n of readdirSync(queue).sort()) {
    if (n >= ticketName) break;
    let t = null;
    try { t = JSON.parse(readFileSync(join(queue, n), "utf8")); } catch {}
    if (t && guardAlive(t)) live.push(t); else rmSync(join(queue, n), { force: true });
  }
  return live;
};

const acquire = async () => {
  mkdirSync(dirname(lockFile), { recursive: true });
  takeTicket();
  process.on("exit", dropTicket);
  const t0 = Date.now();
  let last = -SAY;
  for (;;) {
    const before = ahead();
    if (!before.length && tryLock()) { dropTicket(); return (Date.now() - t0) / 1000; }
    const l = readLock();
    if (l && !holds(l)) { clearDead(); continue; }
    if (Date.now() - t0 - last >= SAY) {
      last = Date.now() - t0;
      const line = before.length ? `, ${before.length} ahead, next ${before[0].name}` : "";
      if (l) say(`waiting: ${l.name} holds the lock, pid ${l.pid}${guardAlive(l) ? "" : ` (its guard died, its job in group ${l.group} runs on unguarded)`}, since ${l.since}${line}`);
      else say(`waiting${line}`);
    }
    if (wait !== null && Date.now() - t0 >= Number(wait) * 1000) { say("gave up waiting"); process.exit(75); }
    await sleep(1000);
  }
};

const release = () => { const l = readLock(); if (l?.pid === process.pid) rmSync(lockFile, { force: true }); };

const waited = await acquire();
const t0 = Date.now();
const free = freePercent(), load = +loadavg()[0].toFixed(2);
const env = { ...process.env, ORIGO_GUARD: String(process.pid), NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${heap}`.trim() };
const child = spawn(command[0], command.slice(1), { stdio: "inherit", detached: true, env });
let peak = 0, over = false, peakProcs = 0, ended = false, code = null, signal = null;

child.on("error", (e) => { say(`could not start: ${e.message}`); code = 127; ended = true; });
child.on("exit", (c, s) => { code = c; signal = s; ended = true; });
if (!child.pid) await sleep(50);
if (child.pid) { me.group = child.pid; renameSync(writeTemp(me), lockFile); }
say(`${name}: started, limit ${limit} MB, heap ${heap} MB, memory free ${free} percent, load ${load}, waited ${waited.toFixed(0)} s`);
log({ event: "start", at: new Date().toISOString(), freePercent: free, load, waitedSeconds: Math.round(waited) });

const killTree = () => {
  if (!child.pid) return;
  const left = tree(child.pid);
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
  for (const p of left) { try { process.kill(p.pid, "SIGKILL"); } catch {} }
};

const finish = (why) => {
  const seconds = +((Date.now() - t0) / 1000).toFixed(1), peakMB = Math.round(peak / MB);
  const outcome = over ? "killed over the limit" : why ?? (signal ? `ended by ${signal}` : `exit ${code}`);
  say(`${name}: ${outcome}, peak ${peakMB} MB, ${peakProcs} processes at most, ${seconds} s`);
  log({ event: "end", at: new Date().toISOString(), outcome, code: over ? 137 : code, peakMB, processes: peakProcs, seconds, freePercentAtEnd: freePercent() });
  release();
  process.exit(over ? 137 : code ?? 1);
};
for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => { killTree(); finish(`guard stopped by ${s}`); });

while (!ended) {
  if (child.pid) {
    const ps = tree(child.pid);
    const kb = ps.reduce((n, p) => n + Math.max(p.rss, footprint(p.pid)), 0);
    if (kb > peak) peak = kb;
    if (ps.length > peakProcs) peakProcs = ps.length;
    if (kb > limit * MB) {
      over = true;
      say(`${name}: ${Math.round(kb / MB)} MB in ${ps.length} processes passes ${limit} MB; killing the tree`);
      killTree();
      for (let i = 0; i < 50 && !ended; i += 1) await sleep(100);
      break;
    }
  }
  await sleep(POLL);
}
killTree();
finish();
