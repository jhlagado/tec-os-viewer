#!/usr/bin/python3
"""Prototype-only cold-start broker/coordinator. No actions on import.

Darwin layouts: SDK sys/proc_info.h, sys/signal.h, sys/resource.h. All signal
authority is direct-parent/unreaped ownership; identity observations alone
NEVER authorize a signal. Native code/build remains inside the owned cohort.
"""
import ctypes as C
import errno
import hashlib
import json
import os
from pathlib import Path
import secrets
import selectors
import signal
import socket
import sys
import time
import struct


_clock = None


def continuous_ns():
    """Shared Darwin clock, never Python monotonic's per-process origin."""
    global _clock
    if _clock is None:
        class Timebase(C.Structure):
            _fields_ = [('numer', C.c_uint32), ('denom', C.c_uint32)]
        lib = C.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        lib.mach_continuous_time.argtypes = []; lib.mach_continuous_time.restype = C.c_uint64
        lib.mach_timebase_info.argtypes = [C.POINTER(Timebase)]
        tb = Timebase()
        if lib.mach_timebase_info(C.byref(tb)) or not tb.denom: raise RuntimeError('continuous clock unavailable')
        _clock = (lib, tb.numer, tb.denom)
    lib, numer, denom = _clock
    return lib.mach_continuous_time() * numer // denom


class Siginfo(C.Structure):
    _fields_ = [('signo', C.c_int), ('error', C.c_int), ('code', C.c_int),
                ('pid', C.c_int), ('uid', C.c_uint), ('status', C.c_int),
                ('addr', C.c_void_p), ('value', C.c_void_p), ('band', C.c_long),
                ('pad', C.c_ulong * 7)]


class BSD(C.Structure):
    _fields_ = [(n, C.c_uint32) for n in ('flags', 'status', 'xstatus', 'pid', 'ppid',
                'uid', 'gid', 'ruid', 'rgid', 'svuid', 'svgid', 'rfu')] + [
                ('comm', C.c_char * 16), ('name', C.c_char * 32)] + [
                (n, C.c_uint32) for n in ('nfiles', 'pgid', 'pjobc', 'tdev', 'tpgid', 'nice')] + [
                ('sec', C.c_uint64), ('usec', C.c_uint64)]


class Usage(C.Structure):
    _fields_ = [('uuid', C.c_ubyte * 16)] + [(n, C.c_uint64) for n in
                ('user', 'system', 'idle', 'interrupt', 'pageins', 'wired', 'resident',
                 'footprint', 'start', 'exit')]


class Busy(RuntimeError):
    """Known not-yet-retired state; never interpreted as an empty cohort."""


def dump(path, obj):
    """Single writer per path; run directory is exclusively coordinator-owned."""
    path = Path(path)
    tmp = path.with_name(path.name + '.' + secrets.token_hex(8))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(obj, f, sort_keys=True, separators=(',', ':'))
        f.write('\n'); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


class Kernel:
    def __init__(self):
        self.lib = C.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        self.proc = C.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        self.lib.waitid.argtypes = [C.c_int, C.c_uint, C.POINTER(Siginfo), C.c_int]
        self.lib.waitid.restype = C.c_int
        self.proc.proc_pidinfo.argtypes = [C.c_int, C.c_int, C.c_uint64, C.c_void_p, C.c_int]
        self.proc.proc_pidinfo.restype = C.c_int
        self.proc.proc_listallpids.argtypes = [C.c_void_p, C.c_int]
        self.proc.proc_listallpids.restype = C.c_int
        self.proc.proc_pid_rusage.argtypes = [C.c_int, C.c_int, C.c_void_p]
        self.proc.proc_pid_rusage.restype = C.c_int
        self.proc.proc_pidpath.argtypes = [C.c_int, C.c_void_p, C.c_uint32]
        self.proc.proc_pidpath.restype = C.c_int
        if (C.sizeof(BSD), C.sizeof(Siginfo), C.sizeof(Usage)) != (136, 104, 96):
            raise RuntimeError('Darwin LP64 SDK layout differs')

    def images(self):
        """Actual mapped-image UUIDs, not invented file hashes for dyld cache."""
        self.lib._dyld_image_count.restype = C.c_uint32
        self.lib._dyld_get_image_name.argtypes = [C.c_uint32]; self.lib._dyld_get_image_name.restype = C.c_char_p
        self.lib._dyld_get_image_header.argtypes = [C.c_uint32]; self.lib._dyld_get_image_header.restype = C.c_void_p
        count = self.lib._dyld_image_count()
        if not 0 < count <= 512: raise RuntimeError('dyld image count bound')
        rows = []
        for i in range(count):
            address = self.lib._dyld_get_image_header(i); name = self.lib._dyld_get_image_name(i)
            if not address or not name: raise RuntimeError('dyld image unknown')
            header = struct.unpack('<IiiIIIII', C.string_at(address, 32))
            if header[0] != 0xfeedfacf or header[4] > 4096 or header[5] > 16 * 1024 * 1024: raise RuntimeError('Mach-O header bound')
            commands = C.string_at(address + 32, header[5]); at = 0; uuid = None
            for _ in range(header[4]):
                if at + 8 > len(commands): raise RuntimeError('Mach-O command truncation')
                cmd, size = struct.unpack_from('<II', commands, at)
                if size < 8 or at + size > len(commands): raise RuntimeError('Mach-O command bound')
                if cmd == 0x1b and size >= 24: uuid = commands[at+8:at+24].hex()
                at += size
            if uuid is None: raise RuntimeError('mapped image UUID missing')
            rows.append({'path': os.fsdecode(name), 'mappedImageUuid': uuid})
        return rows

    def identity(self, pid):
        b = self.bsd(pid); path = C.create_string_buffer(4096)
        sid = os.getsid(pid)
        if self.proc.proc_pidpath(pid, path, len(path)) <= 0: raise RuntimeError('executable path unknown')
        exe = os.fsdecode(path.value); h = hashlib.sha256(); total = 0
        with open(exe, 'rb') as f:
            before_file = os.fstat(f.fileno())
            while block := f.read(65536):
                total += len(block)
                if total > 512 * 1024 * 1024: raise RuntimeError('executable hash bound')
                h.update(block)
            after_file = os.fstat(f.fileno())
            if (before_file.st_dev, before_file.st_ino, before_file.st_size, before_file.st_mtime_ns) != (after_file.st_dev, after_file.st_ino, after_file.st_size, after_file.st_mtime_ns) or total != before_file.st_size:
                raise RuntimeError('executable bytes changed')
        after = self.bsd(pid)
        after_path = C.create_string_buffer(4096)
        if self.proc.proc_pidpath(pid, after_path, len(after_path)) <= 0 or after_path.value != path.value or os.getsid(pid) != sid:
            raise RuntimeError('executable/session transition during inspection')
        if (b.pid, b.sec, b.usec, b.pgid, b.ppid) != (after.pid, after.sec, after.usec, after.pgid, after.ppid):
            raise RuntimeError('identity changed')
        u = Usage()
        if self.proc.proc_pid_rusage(pid, 0, C.byref(u)): raise RuntimeError('memory unknown')
        return {'state': 'present', 'pid': pid, 'ppid': b.ppid, 'pgid': b.pgid, 'sid': sid,
                'birthSec': b.sec, 'birthUsec': b.usec, 'status': b.status,
                'exe': exe, 'exeSha256': h.hexdigest(), 'memoryBytes': max(u.resident, u.footprint),
                'clockDomain': 'darwin-mach-continuous-ns-node24.18', 'clockNs': str(continuous_ns())}

    def wait(self, child, options):
        info = Siginfo()
        if self.lib.waitid(1, child, C.byref(info), options):
            raise OSError(C.get_errno(), 'targeted waitid: ownership unknown')
        return info

    def bsd(self, pid):
        row = BSD()
        C.set_errno(0)
        n = self.proc.proc_pidinfo(pid, 3, 0, C.byref(row), C.sizeof(row))
        native_errno = C.get_errno()
        if n != C.sizeof(row):
            error = OSError(native_errno, 'precise process inspection unknown')
            error.inspection = {'operation': 'proc_pidinfo', 'pid': pid, 'flavor': 3,
                                'rawReturn': n, 'errno': native_errno, 'expectedBytes': C.sizeof(row)}
            raise error
        return row

    def table(self, deadline_ns=None):
        until = min(continuous_ns() + 150_000_000, deadline_ns) if deadline_ns is not None else continuous_ns() + 150_000_000
        ids = (C.c_int * 65536)()
        C.set_errno(0)
        n = self.proc.proc_listallpids(ids, C.sizeof(ids))
        native_errno = C.get_errno()
        if not 0 < n < len(ids):
            error = RuntimeError('table unknown/truncated')
            error.inspection = {'operation': 'proc_listallpids', 'pid': None, 'rawReturn': n,
                                'errno': native_errno, 'bufferBytes': C.sizeof(ids), 'pidSlots': len(ids)}
            raise error
        rows = []
        for pid in ids[:n]:
            if pid < 2: continue
            if continuous_ns() >= until:
                error = TimeoutError('kernel table budget')
                error.inspection = {'operation': 'process-table-deadline', 'pid': pid,
                                    'enumeratedCount': n, 'completedRows': len(rows), 'deadlineNs': str(until)}
                raise error
            try:
                b = self.bsd(pid); sid = os.getsid(pid)
            except OSError as e:
                if e.errno == errno.ESRCH: continue
                if not hasattr(e, 'inspection'):
                    e.inspection = {'operation': 'getsid', 'pid': pid, 'errno': e.errno, 'rawReturn': -1}
                e.inspection.update(enumeratedCount=n, completedRows=len(rows), deadlineNs=str(until))
                raise
            rows.append({'pid': pid, 'ppid': b.ppid, 'pgid': b.pgid, 'sid': sid,
                         'birthSec': b.sec, 'birthUsec': b.usec, 'status': b.status})
        return rows


class Broker:
    def __init__(self, root, run, capability, t0, policy, node):
        self.root, self.run, self.cap = root, run, capability
        self.t0 = t0
        self.offsets = (2, 3, 4, 5) if policy == 'synthetic' else (110, 115, 118, 120)
        self.k = Kernel(); self.groups = {}; self.closed = False; self.unknown = False
        self.seq = 0; self.head = '0' * 64; self.exit_requested = False
        self.helpers = set()
        self.signals_sent = set(); self.known_owned = {}
        self.peak_bytes = 0
        self.grace_requested = False
        self.node = node
        self.first_snapshot_failure = None
        signal.signal(signal.SIGCHLD, signal.SIG_DFL)

    def next_edge(self):
        current = continuous_ns()
        return next((self.t0 + n * 10**9 for n in self.offsets if self.t0 + n * 10**9 > current), self.t0 + self.offsets[-1] * 10**9)

    def event(self, kind, **fields):
        if continuous_ns() >= self.t0 + self.offsets[-1] * 10**9:
            self.unknown = True
            return  # no new filesystem helper after expiry; external record owns handoff
        event = {'seq': self.seq, 'previous': self.head, 'runId': self.run,
                 'writerPid': os.getpid(), 'monoNs': str(continuous_ns()), 'kind': kind, **fields}
        raw = json.dumps(event, sort_keys=True, separators=(',', ':')).encode()
        self.head = hashlib.sha256(raw).hexdigest(); self.seq += 1
        def write():
            with (self.root / 'broker-events.jsonl').open('ab') as f:
                f.write(raw + b'\n'); f.flush(); os.fsync(f.fileno())
        self.owned_helper(write)

    def owned_helper(self, action, deadline_ns=None):
        if deadline_ns is not None and continuous_ns() >= deadline_ns:
            raise TimeoutError('fixed helper deadline expired before fork')
        child = os.fork()
        if child == 0:
            try: action(); os._exit(0)
            except BaseException: os._exit(70)
        self.helpers.add(child)
        until = min(continuous_ns() + 150_000_000, self.next_edge())
        if deadline_ns is not None: until = min(until, deadline_ns)
        while continuous_ns() < until:
            info = self.k.wait(child, 4 | 1 | 32)
            if info.pid:
                os.waitpid(child, os.WNOHANG); self.helpers.remove(child)
                if info.status != 0: raise RuntimeError('owned helper failed')
                return
            time.sleep(.001)
        # Direct-parent retained child, not an identity-check-to-kill fallback.
        self.k.wait(child, 4 | 1 | 32)
        os.kill(child, signal.SIGKILL)
        self.unknown = self.closed = True
        raise TimeoutError('owned helper timed out; retained for cleanup')

    def retained(self, g):
        if g['retired']: raise RuntimeError('revoked token')
        # No consuming WEXITED wait anywhere except retire. A zero si_pid means
        # still-running direct child, not ownership loss; ECHILD fails closed.
        return self.k.wait(g['pid'], 4 | 1 | 32)

    def stopped(self, pid):
        until = min(self.t0 + self.offsets[-1] * 10**9, continuous_ns() + 150_000_000)
        while continuous_ns() < until:
            info = self.k.wait(pid, 8 | 4 | 1 | 32)
            if info.pid:
                if info.code != 5 or info.status != signal.SIGSTOP:
                    raise RuntimeError('child did not stop')
                consumed = self.k.wait(pid, 8 | 1)  # consume stop ONLY, never an exit
                if consumed.pid != pid or consumed.code != 5 or consumed.status != signal.SIGSTOP:
                    raise RuntimeError('stop changed during consume')
                return
            time.sleep(.001)
        raise TimeoutError('stopped-child boundary')

    def create(self, token, argv, env, executable_seal, script_seals, startup_only=False):
        if self.closed or len(self.groups) >= 32 or token in self.groups:
            raise RuntimeError('launch closed/count/token')
        if (len(token) != 64 or any(c not in '0123456789abcdef' for c in token) or
                not isinstance(argv, list) or not 1 <= len(argv) <= 128 or
                not all(isinstance(a, str) and len(a) <= 8192 for a in argv) or
                not Path(argv[0]).is_absolute()): raise ValueError('launch plan')
        if executable_seal.get('path') != argv[0] or len(executable_seal.get('sha256', '')) != 64:
            raise ValueError('executable seal required')
        plan_digest = hashlib.sha256(json.dumps({'argv': argv, 'executable': executable_seal,
                    'scripts': script_seals}, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.event('create-intent', token=token, argvSha256=hashlib.sha256(json.dumps(argv).encode()).hexdigest())
        child = os.fork()
        if child == 0:
            try:
                os.kill(os.getpid(), signal.SIGSTOP)
                os.setsid()
                os.kill(os.getpid(), signal.SIGSTOP)
                worker = os.fork()
                if worker == 0:
                    os.kill(os.getpid(), signal.SIGSTOP)
                    # Immutable fork-copied argv/seals, never a mutable plan path.
                    for expected in [executable_seal, *script_seals]:
                        h = hashlib.sha256(); total = 0
                        fd = os.open(expected['path'], os.O_RDONLY | os.O_NOFOLLOW)
                        with os.fdopen(fd, 'rb') as f:
                            while block := f.read(65536):
                                total += len(block)
                                if total > 512 * 1024 * 1024: os._exit(70)
                                h.update(block)
                        if h.hexdigest() != expected['sha256']: os._exit(70)
                    os.execve(argv[0], argv, env)
                while True:
                    try: os.waitpid(worker, os.WNOHANG)  # worker only, never anchor
                    except ChildProcessError: pass
                    time.sleep(.01)
            finally: os._exit(70)
        g = {'pid': child, 'phase': 'inherited', 'retired': False, 'token': token, 'generation': 0,
             'startupOnly': startup_only, 'planSha256': plan_digest}
        self.groups[token] = g  # registered even when inspection subsequently fails
        self.stopped(child); b = self.k.bsd(child)
        g.update(birthSec=b.sec, birthUsec=b.usec, parentPid=os.getpid())
        self.event('inherited-stop', group=g)
        return g

    def cont(self, g, bundle=None):
        if self.closed: raise RuntimeError('launches closed')
        self.retained(g)
        if not g['startupOnly']:
            expected = {'bundle': bundle, 'token': g['token'], 'generation': g['generation'],
                        'phase': g['phase'], 'anchorBirth': [g['pid'], g['birthSec'], g['birthUsec']],
                        'planSha256': g['planSha256']}
            path = self.root / ('transition-' + secrets.token_hex(16) + '.json')
            self.owned_helper(lambda: dump(path, expected))
            self.owned_helper(lambda: os.execv(self.node, [self.node, str(Path(__file__).with_name('ack-check.mjs')),
                                                               str(path), str(self.root / 'harness.json')]))
        if g['phase'] == 'inherited':
            os.kill(g['pid'], signal.SIGCONT)  # own unreaped direct child
            self.stopped(g['pid']); b = self.k.bsd(g['pid'])
            if b.pgid != g['pid'] or os.getsid(g['pid']) != g['pid'] or (b.sec, b.usec) != (g['birthSec'], g['birthUsec']):
                raise RuntimeError('session transition not private')
            g['phase'] = 'session'
        else:
            # Private SID and unreaped anchor pin this exact group number.
            # Only already-published transitions may request CONT.
            os.killpg(g['pid'], signal.SIGCONT)
            if g['phase'] == 'active': g['startupOnly'] = False
            g['phase'] = 'active'
        g['generation'] += 1; self.event('continue', group=g)
        return g

    def stop(self, sig):
        self.closed = True
        if sig in self.signals_sent: return
        self.signals_sent.add(sig)
        deliveries = []
        for g in self.groups.values():
            if g['retired']: continue
            try:
                self.retained(g)
                if g['phase'] == 'inherited': os.kill(g['pid'], sig)
                else: os.killpg(g['pid'], sig)
                deliveries.append({'token': g['token'], 'signal': int(sig), 'authority': 'OWNED_UNREAPED_DIRECT_CHILD'})
            except ProcessLookupError: pass  # still requires retirement observation
            except Exception as e:
                self.unknown = True; deliveries.append({'token': g['token'], 'unknown': str(e)})
        self.event('signals-batch', deliveries=deliveries)

    def retire(self, g):
        if not self.closed: raise RuntimeError('retire before launch closure')
        info = self.retained(g)
        if info.pid != g['pid']: raise Busy('anchor not exited')
        rows = self.k.table(self.next_edge())
        live_births = {(p['pid'], p['birthSec'], p['birthUsec']): p for p in rows}
        if any(b in live_births and live_births[b]['sid'] != sid for b, sid in self.known_owned.items()):
            raise RuntimeError('owned session escape unresolved; no signal fallback')
        if any(p['sid'] == g['pid'] and p['pid'] != g['pid'] for p in rows):
            raise Busy('non-anchor members remain')
        g['retired'] = True; self.event('token-invalidated', token=g['token'])
        if os.waitpid(g['pid'], os.WNOHANG)[0] != g['pid']:
            self.unknown = True; raise RuntimeError('exact reap unresolved')
        self.event('anchor-reaped', token=g['token'])

    def retain_snapshot_failure(self, kind, evidence, error=None):
        """First cause only; diagnostic bytes never certify a usable sample."""
        if self.first_snapshot_failure is not None: return
        record = {**evidence, 'kind': kind, 'capturedBeforeStop': not bool(self.signals_sent),
                  'priorSignalsSent': [int(s) for s in self.signals_sent],
                  'sampleEndNs': str(continuous_ns()), 'sampleUsable': False,
                  'exceptionType': type(error).__name__ if error is not None else None,
                  'exceptionMessage': str(error)[:512] if error is not None else None,
                  'nativeFailure': getattr(error, 'inspection', None) if error is not None else None}
        # Bounded partial evidence, explicitly not a complete table/cohort.
        record['rawMemorySamplesOmitted'] = record['memoryCallsAttempted'] - len(record['rawMemorySamples'])
        record['cohortRowsOmitted'] = record['cohortCount'] - len(record['cohortRowsRetained'])
        record['publicationError'] = None
        def bounded_record(value):
            def size():
                # Exactly dump()'s JSON encoding, including its terminal newline.
                return len(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()) + 1
            while size() > 16384 and value.get('cohortRowsRetained'):
                value['cohortRowsRetained'].pop(); value['cohortRowsOmitted'] += 1
            while size() > 16384 and value.get('rawMemorySamples'):
                value['rawMemorySamples'].pop(); value['rawMemorySamplesOmitted'] += 1
            if size() > 16384:
                # Fixed-shape fallback retains the first cause and last raw
                # usage call, not an unbounded repr or an unusable JSON prefix.
                last = value.get('lastMemoryCall') or {}
                native = value.get('nativeFailure') or {}
                value = {k: value.get(k) for k in ('runId', 'kind', 'sampleStartNs', 'sampleEndNs', 'deadlineNs',
                         'capturedBeforeStop', 'priorSignalsSent', 'sampleUsable', 'thresholdBytes', 'accumulatedBytes',
                         'phase', 'operation', 'pid', 'rawReturn', 'errno', 'expectedBytes', 'memoryCallsAttempted',
                         'memoryReadsCompleted', 'tableRowsCompleted', 'cohortCount')}
                value.update(diagnosticTruncated=True,
                    rawMemorySamplesOmitted=record['memoryCallsAttempted'] - (1 if last else 0),
                    cohortRowsOmitted=record['cohortCount'],
                    exceptionType=str(record.get('exceptionType'))[:128],
                    exceptionMessage=str(record.get('exceptionMessage'))[:512],
                    publicationError=str(record.get('publicationError'))[:512],
                    nativeFailure={k: native[k] for k in ('operation', 'pid', 'rawReturn', 'errno', 'expectedBytes',
                        'bufferBytes', 'pidSlots', 'enumeratedCount', 'completedRows', 'deadlineNs') if k in native},
                    lastMemoryCall={k: last[k] for k in ('identity', 'flavor', 'rawReturn', 'errno', 'expectedBytes',
                        'rawStructHex', 'fields', 'residentBytes', 'footprintBytes') if k in last})
            if size() > 16384: raise AssertionError('bounded first-failure record exceeds16KiB')
            return value
        record = bounded_record(record)
        self.first_snapshot_failure = record
        try:
            fixed_deadline = int(evidence['deadlineNs'])
            if (self.signals_sent or continuous_ns() >= fixed_deadline or
                    continuous_ns() >= self.t0 + self.offsets[1] * 10**9):
                raise TimeoutError('diagnostic publication skipped: original snapshot deadline/escalation')
            self.owned_helper(lambda: dump(self.root / 'first-snapshot-failure.json', record), deadline_ns=fixed_deadline)
        except Exception as publication_error:
            # Never replace the original inspection/cap cause with this error.
            record['publicationError'] = str(publication_error)[:512]
            self.first_snapshot_failure = bounded_record(record)

    def snapshot(self):
        started = continuous_ns(); until = min(started + 150_000_000, self.next_edge())
        evidence = {'runId': self.run, 'sampleStartNs': str(started), 'deadlineNs': str(until),
                    'phase': 'process-table', 'operation': 'process-table', 'pid': None,
                    'thresholdBytes': 700 * 1024 * 1024, 'accumulatedBytes': 0,
                    'tableRowsCompleted': 0, 'cohortCount': 0, 'cohortRowsRetained': [],
                    'memoryCallsAttempted': 0, 'memoryReadsCompleted': 0, 'rawMemorySamples': [],
                    'usageBytes': C.sizeof(Usage),
                    'usageOffsets': {name: getattr(Usage, name).offset for name, _ in Usage._fields_}}
        try:
            rows = self.k.table(until); sids = {g['pid'] for g in self.groups.values() if not g['retired']}
            evidence['tableRowsCompleted'] = len(rows)
            for row in rows:
                if row['sid'] in sids:
                    self.known_owned[(row['pid'], row['birthSec'], row['birthUsec'])] = row['sid']
            cohort = [p for p in rows if p['sid'] in sids or p['pid'] in (os.getpid(), os.getppid()) or p['pid'] in self.helpers]
            evidence.update(phase='cohort-memory', cohortCount=len(cohort), cohortRowsRetained=[dict(p) for p in cohort[:32]])
            total = 0
            for row in cohort:
                evidence.update(operation='proc_pid_rusage', pid=row['pid'], identity=dict(row),
                                expectedBytes=C.sizeof(Usage), rawReturn=None, errno=None)
                if continuous_ns() >= until: raise TimeoutError('cohort memory budget')
                u = Usage(); C.set_errno(0)
                result = self.k.proc.proc_pid_rusage(row['pid'], 0, C.byref(u))
                native_errno = C.get_errno()  # immediately after this native call
                evidence['memoryCallsAttempted'] += 1
                evidence.update(rawReturn=result, errno=native_errno)
                sample = {'identity': dict(row), 'flavor': 0, 'rawReturn': result, 'errno': native_errno,
                          'expectedBytes': C.sizeof(u), 'rawStructHex': C.string_at(C.byref(u), C.sizeof(u)).hex(),
                          'fields': {name: int(getattr(u, name)) for name, _ in Usage._fields_ if name != 'uuid'},
                          'residentBytes': int(u.resident), 'footprintBytes': int(u.footprint)}
                evidence['lastMemoryCall'] = sample
                if len(evidence['rawMemorySamples']) < 8: evidence['rawMemorySamples'].append(sample)
                if result:
                    raise RuntimeError('cohort memory unknown')
                evidence['memoryReadsCompleted'] += 1
                row['memoryBytes'] = max(u.resident, u.footprint); total += row['memoryBytes']
                evidence['accumulatedBytes'] = total
                path = C.create_string_buffer(4096); C.set_errno(0)
                result = self.k.proc.proc_pidpath(row['pid'], path, len(path))
                native_errno = C.get_errno()
                evidence.update(operation='proc_pidpath', rawReturn=result, errno=native_errno, expectedBytes=len(path))
                if result > 0: row['exe'] = os.fsdecode(path.value)
                elif row['status'] != 5: raise RuntimeError('live executable path unknown')
            if total > 700 * 1024 * 1024:
                evidence.update(phase='cohort-memory-threshold', operation='sum-max-resident-footprint', pid=None,
                                rawReturn=None, errno=None, expectedBytes=None)
                self.retain_snapshot_failure('SAMPLED_MEMORY_THRESHOLD_EXCEEDED', evidence)
                self.stop(signal.SIGKILL)
            self.peak_bytes = max(self.peak_bytes, total)
            return {'rows': cohort, 'memoryBytes': total, 'registrySha256': self.head}
        except Exception as error:
            self.retain_snapshot_failure('INSPECTION_EXCEPTION', evidence, error)
            raise

    def request(self, req):
        if req.get('capability') != self.cap or req.get('runId') != self.run:
            raise PermissionError('broker capability/run')
        op = req['op']; g = self.groups.get(req.get('token'))
        if op == 'create':
            startup = req.get('startupOnly', False)
            allowed = {str(Path(__file__).with_name(f)) for f in ('run.mjs', 'peer.mjs', 'guard-entry.mjs')}
            if startup and (len(req['argv']) < 2 or req['argv'][1] not in allowed):
                raise RuntimeError('only sealed startup entry programs may use root acknowledgement')
            self.create(req['token'], req['argv'], req['env'], req['executableSeal'], req.get('scriptSeals', []), startup)
        elif op == 'continue' and g: self.cont(g, req.get('ackBundle'))
        elif op in ('term', 'kill'): self.stop(signal.SIGTERM if op == 'term' else signal.SIGKILL)
        elif op == 'kill-token' and g:
            self.closed = True; self.retained(g)
            if g['phase'] == 'inherited': os.kill(g['pid'], signal.SIGKILL)
            else: os.killpg(g['pid'], signal.SIGKILL)
            self.event('fault-kill-owned-token', token=g['token'])
        elif op == 'retire' and g: self.retire(g)
        elif op == 'snapshot': return self.snapshot()
        elif op == 'exit':
            if any(not g['retired'] for g in self.groups.values()) or self.helpers: raise Busy('broker still owns groups/helpers')
            self.exit_requested = True
        elif op != 'status': raise ValueError('unknown broker op/token')
        return {'groups': list(self.groups.values()), 'closed': self.closed, 'unknown': self.unknown,
                'registrySha256': self.head, 'brokerPid': os.getpid(),
                'signalsSent': [int(s) for s in self.signals_sent], 'sampledPeakBytesLowerBound': self.peak_bytes,
                **({'firstSnapshotFailure': self.first_snapshot_failure} if self.first_snapshot_failure is not None else {})}

    def serve(self):
        path = self.root / 'broker.sock'
        listener = socket.socket(socket.AF_UNIX); listener.bind(str(path)); listener.listen(16); listener.setblocking(False)
        os.chmod(path, 0o600)
        selector = selectors.DefaultSelector(); selector.register(listener, selectors.EVENT_READ)
        clients = {}; last_sample = 0
        while not self.exit_requested or clients:
            elapsed = (continuous_ns() - self.t0) / 1e9
            if elapsed >= self.offsets[0]:
                self.closed = True
                if not self.grace_requested:
                    self.grace_requested = True
                    try: self.owned_helper(lambda: dump(self.root / 'shutdown-request.json',
                         {'kind': 'GRACEFUL_CLOSE_REQUEST', 'monoNs': str(continuous_ns())}))
                    except Exception: self.unknown = True
            if elapsed >= self.offsets[2]: self.stop(signal.SIGKILL)
            elif elapsed >= self.offsets[1]: self.stop(signal.SIGTERM)
            if elapsed >= self.offsets[-1]: self.unknown = True
            # Exact-child helper reaping only; no competing anchor reaper.
            for child in list(self.helpers):
                info = self.k.wait(child, 4 | 1 | 32)
                if info.pid: os.waitpid(child, os.WNOHANG); self.helpers.remove(child)
            if elapsed >= self.offsets[-1] + 1:
                # Bounded terminal unknown handoff, never false cleanup/release.
                return 70
            if continuous_ns() - last_sample > 200_000_000:
                try: self.snapshot()
                except Exception as e: self.unknown = True; self.stop(signal.SIGKILL)
                last_sample = continuous_ns()
            for key, _ in selector.select(.01)[:1]:  # recheck absolute policy before every client
                if key.fileobj is listener:
                    conn, _ = listener.accept(); conn.setblocking(False)
                    if len(clients) >= 16: conn.close(); continue
                    clients[conn] = [bytearray(), continuous_ns() + 150_000_000, None]
                    selector.register(conn, selectors.EVENT_READ)
                else:
                    conn = key.fileobj; state = clients[conn]
                    try:
                        if state[2] is None:
                            block = conn.recv(65536)
                            if not block: raise EOFError('partial request')
                            state[0].extend(block)
                            if len(state[0]) > 65536: raise ValueError('IPC byte limit')
                            if b'\n' in state[0]:
                                req = json.loads(state[0])
                                try: reply = {'ok': True, 'result': self.request(req)}
                                except Busy as e: reply = {'ok': False, 'error': str(e), 'state': 'OWNED_BUSY', 'firstSnapshotFailure': self.first_snapshot_failure}
                                except Exception as e:
                                    self.unknown = self.closed = True
                                    reply = {'ok': False, 'error': str(e), 'state': 'UNRESOLVED_HELD', 'firstSnapshotFailure': self.first_snapshot_failure}
                                state[2] = bytearray(json.dumps(reply, separators=(',', ':')).encode() + b'\n')
                                if len(state[2]) > 262144: raise ValueError('IPC output limit')
                                selector.modify(conn, selectors.EVENT_WRITE)
                        else:
                            n = conn.send(state[2]); del state[2][:n]
                            if not state[2]: raise EOFError('complete')
                    except BlockingIOError: pass
                    except Exception as e:
                        if not isinstance(e, EOFError): self.unknown = True
                        selector.unregister(conn); conn.close(); del clients[conn]
            for conn, state in list(clients.items()):
                if continuous_ns() >= state[1]:
                    selector.unregister(conn); conn.close(); del clients[conn]; self.unknown = True
        self.event('broker-exit', unknown=self.unknown)
        return 70 if self.unknown else 0


def call(root, run, capability, op, **fields):
    with socket.socket(socket.AF_UNIX) as s:
        s.settimeout(.2); s.connect(str(root / 'broker.sock'))
        s.sendall(json.dumps({'runId': run, 'capability': capability, 'op': op, **fields}).encode() + b'\n')
        out = bytearray()
        while b'\n' not in out:
            b = s.recv(65536)
            if not b or len(out) + len(b) > 262144: raise RuntimeError('broker reply unknown')
            out.extend(b)
        reply = json.loads(out)
        if not reply.get('ok'):
            error = Busy(reply.get('error', 'broker refused'))
            error.first_snapshot_failure = reply.get('firstSnapshotFailure')
            raise error
        return reply['result']


def main():
    # Concrete command: python root.py CASE EXCLUSIVE_OUT NODE ALLOCATION_JSON.
    if len(sys.argv) != 6: raise SystemExit(64)
    case, variant, destination, node, allocation = sys.argv[1:]
    allowed = {'D5': ['inherited', 'session', 'worker', 'bootstrap'], 'D9': ['timeout', 'malformed'],
               'D10': ['birth', 'planned-group'], 'D12': ['death', 'channel-loss']}
    if case not in [f'D{i}' for i in range(1, 13)] + ['B1', 'B2'] or variant not in allowed.get(case, ['only']): raise SystemExit(64)
    t0 = continuous_ns()
    root = Path(destination).absolute(); root.mkdir(mode=0o700)  # never reuse
    os.umask(0o077); k = Kernel()
    permit = json.loads(Path(allocation).read_text())
    source_seal_sha = hashlib.sha256(Path(__file__).with_name('source-seal.json').read_bytes()).hexdigest()
    if permit.get('case') != case or permit.get('variant') != variant or permit.get('sourceSealSha256') != source_seal_sha or permit.get('status') != 'EXPLICITLY_ALLOCATED' or not permit.get('owner'):
        dump(root / 'incident.json', {'state': 'UNRESOLVED', 'reason': 'allocation missing/mismatched'}); raise SystemExit(77)
    source_manifest = json.loads(Path(__file__).with_name('source-seal.json').read_text())
    if len(source_manifest['sourceFiles']) > 64: raise RuntimeError('source manifest count bound')
    for name, expected in source_manifest['sourceFiles'].items():
        if Path(name).name != name: raise RuntimeError('source manifest path')
        path = Path(__file__).with_name(name)
        if path.stat().st_size > 32 * 1024 * 1024 or hashlib.sha256(path.read_bytes()).hexdigest() != expected['sha256']:
            raise RuntimeError('prepared source changed before root launch')
    run, cap = secrets.token_hex(16), secrets.token_hex(32)
    config = {'version': 1, 'runId': run, 'capability': cap, 'owner': permit['owner'],
              'ownerNonce': secrets.token_hex(32), 't0Ns': str(t0), 'case': case,
              'policy': 'synthetic' if case.startswith('D') else 'real', 'root': str(root),
              'node': node, 'coordinatorPid': os.getpid(), 'variant': variant,
              'probe': str(Path(__file__).absolute())}
    dump(root / 'reserved.json', {**config, 'state': 'RESERVED'})
    dump(root / 'darwin-runtime.json', {'kernel': list(os.uname()), 'mappedImages': k.images(),
         'SDKLayouts': {'proc_bsdinfo': C.sizeof(BSD), 'siginfo_t': C.sizeof(Siginfo), 'rusage_info_v0': C.sizeof(Usage)},
         'clockDomain': 'darwin-mach-continuous-ns-node24.18'})
    broker = os.fork()
    if broker == 0:
        try: os._exit(Broker(root, run, cap, t0, config['policy'], os.path.realpath(node)).serve())
        except BaseException: os._exit(70)
    # This parent never reaps broker before observing final ownership closure.
    token = secrets.token_hex(32); end = t0 + (10 if case.startswith('D') else 125) * 10**9
    try:
        while not (root / 'broker.sock').exists():
            if continuous_ns() >= end: raise TimeoutError('broker startup')
            time.sleep(.005)
        state = call(root, run, cap, 'create', token=token,
                     argv=[os.path.realpath(node), str(Path(__file__).with_name('run.mjs')), str(root / 'reserved.json')], env=dict(os.environ), startupOnly=True,
                     executableSeal={'path': os.path.realpath(node), 'sha256': '72c18e2eeda260f67a5b2b66e96fa9b5ad82864676ebb54925695d87120cae3f'},
                     scriptSeals=[{'path': str(Path(__file__).with_name('run.mjs')), 'sha256':
                        json.loads(Path(__file__).with_name('source-seal.json').read_text())['sourceFiles']['run.mjs']['sha256']}])
        dump(root / 'root-inherited-ack.json', state)
        state = call(root, run, cap, 'continue', token=token); dump(root / 'root-session-ack.json', state)
        call(root, run, cap, 'continue', token=token)
        while continuous_ns() < end:
            rows = call(root, run, cap, 'snapshot')['rows']
            anchor = next(g['pid'] for g in state['groups'] if g['token'] == token)
            stopped = [p for p in rows if p['ppid'] == anchor and p['status'] == 4]
            if stopped:
                dump(root / 'root-worker-stop-ack.json', {'token': token, 'workers': stopped})
                call(root, run, cap, 'continue', token=token); break
            time.sleep(.005)
        else: raise TimeoutError('root worker stop not observed')
        d1_sample = None; d3_observed = False
        while continuous_ns() < end:
            state = call(root, run, cap, 'status')
            elapsed = (continuous_ns() - t0) / 1e9
            if (case == 'D1' and (root / 'activated.json').exists() and not (root / 'blocked-observed.json').exists() and
                    (d1_sample is None or continuous_ns() - int(d1_sample['readEndedNs']) >= 50_000_000)):
                from oracle import d1_identity_key, d1_worker_binding, d1_observation_valid, d1_pair_valid, d1_different_birth_control
                records = {}
                for name in ('activated.json', 'bootstrap-dual-ack-ready.json', 'lease.json', 'runtime-source-seal.json'):
                    path = root / name
                    if path.stat().st_size > 262144: raise RuntimeError('D1 identity record byte bound')
                    records[name] = json.loads(path.read_text())
                activation, runtime = records['activated.json'], records['runtime-source-seal.json']
                expected = d1_worker_binding(records['bootstrap-dual-ack-ready.json'], records['lease.json'],
                                             runtime.get('node') if isinstance(runtime, dict) else None)
                if expected is None or not isinstance(activation, dict) or type(activation.get('identityPid')) is not int or activation['identityPid'] != expected['pid']:
                    raise RuntimeError('D1 missing/malformed acknowledged worker binding')
                target = expected['pid']; observation_deadline = min(t0 + 5 * 10**9, continuous_ns() + 150_000_000)
                before = k.identity(target)
                if d1_identity_key(before) != d1_identity_key(expected): raise RuntimeError('D1 identity differs before CPU read')
                read_started = continuous_ns(); u = Usage()
                if k.proc.proc_pid_rusage(target, 0, C.byref(u)): raise RuntimeError('D1 CPU inspection unknown')
                read_ended = continuous_ns(); after = k.identity(target)
                observation = {'identityBefore': before, 'identityAfter': after,
                               'readStartedNs': str(read_started), 'readEndedNs': str(read_ended),
                               'cpuUserNs': int(u.user), 'cpuSystemNs': int(u.system),
                               'completionAbsent': not (root / 'worker-returned.json').exists()}
                if continuous_ns() >= observation_deadline or not d1_observation_valid(expected, observation):
                    raise RuntimeError('D1 CPU read identity bracket invalid/expired')
                if d1_sample is None:
                    d1_sample = observation  # preserve first full identity, clocks and counters
                else:
                    observations = [d1_sample, observation]
                    if not d1_pair_valid(expected, observations): raise RuntimeError('D1 CPU advancement/identity proof invalid')
                    control = d1_different_birth_control(expected, observations)
                    if control is None or control['actualComparatorRejected'] is not True:
                        raise RuntimeError('D1 different-birth control was not rejected')
                    dump(root / 'blocked-observed.json', {'expectedWorker': expected, 'observations': observations,
                         'cpuAdvanced': True, 'noCompletion': True, 'differentBirthControl': control})
            if case == 'D3' and 3.05 < elapsed < 4 and not d3_observed and (root / 'd3-prerequisite.json').exists():
                prior = json.loads((root / 'd3-prerequisite.json').read_text())
                rows = k.table()
                still = [p for p in rows if any(all(p[x] == q[x] for x in ('pid', 'birthSec', 'birthUsec', 'ppid', 'pgid', 'sid')) for q in prior['members'])]
                handlers = [(root / (name + '-term.json')).exists() for name in ('ignore-child', 'ignore-grandchild')]
                if len(still) == 2 and all(handlers):
                    dump(root / 'd3-after-term-independent.json', {'members': still, 'actualHandlerRecords': handlers,
                         'observedNs': str(continuous_ns())}); d3_observed = True
            # Graceful closure at2/110 is not forced termination. The broker's
            # independent TERM/KILL schedule remains3/4 or115/118.
            kill_at = 4 if case.startswith('D') else 118
            if (root / 'result.json').exists() or elapsed >= kill_at or signal.SIGKILL in state['signalsSent']:
                call(root, run, cap, 'kill')
                for g in state['groups']:
                    if not g['retired']:
                        try: call(root, run, cap, 'retire', token=g['token'])
                        except Exception: pass  # bounded same-allocation sampling, not retry job
                state = call(root, run, cap, 'status')
                if all(g['retired'] for g in state['groups']):
                    call(root, run, cap, 'exit'); break
            time.sleep(.02)
        else: raise TimeoutError('operator envelope; reservation retained')
        info = k.wait(broker, 4 | 1 | 32)
        while not info.pid and continuous_ns() < end:
            time.sleep(.005); info = k.wait(broker, 4 | 1 | 32)
        if info.pid != broker: raise RuntimeError('broker exit unknown')
        broker_status = info.status
        os.waitpid(broker, 0)
        from oracle import assess
        dump(root / 'control-reading.json', assess(root, case, variant, t0, continuous_ns(), broker_status, state['unknown']))
        if broker_status != 0 or state['unknown']:
            raise RuntimeError('broker exit/unknown history prohibits clean outcome')
        # Separate observer exits before THIS external coordinator authorizes release.
        observer = os.fork()
        if observer == 0:
            try:
                rows = k.table()
                anchors = {g['pid'] for g in state['groups']}
                if any(p['sid'] in anchors or p['pid'] == broker for p in rows): os._exit(70)
                dump(root / 'provisional.json', {'state': 'OBSERVER_PROVISIONAL_ONLY',
                     'remaining': [k.identity(os.getpid()), k.identity(os.getppid())], 'release': False})
                os._exit(0)
            except BaseException: os._exit(70)
        observed = k.wait(observer, 4 | 1 | 32)
        while not observed.pid and continuous_ns() < end:
            time.sleep(.005); observed = k.wait(observer, 4 | 1 | 32)
        if observed.pid != observer or observed.status != 0: raise RuntimeError('observer exit unresolved')
        os.waitpid(observer, 0)
        provisional = json.loads((root / 'provisional.json').read_text())
        terminal_sample = sum(p['memoryBytes'] for p in provisional['remaining'])
        dump(root / 'external-confirmation-required.json', {'state': 'ROOT_EXIT_CONFIRMATION_REQUIRED', 'runId': run,
              'observerExactChildReaped': observer, 'remaining': [k.identity(os.getpid())],
              'release': False, 'cohortStoppedAtNs': str(continuous_ns()),
              'sampledPeakBytesLowerBound': max(state['sampledPeakBytesLowerBound'], terminal_sample),
              'terminalRootAndObserverSampleBytes': terminal_sample,
              'withinHardDeadline': continuous_ns() <= t0 + (5 if case.startswith('D') else 120) * 10**9})
    except BaseException as e:
        dump(root / 'incident.json', {'state': 'UNRESOLVED', 'runId': run, 'reason': str(e), 'reservation': 'HELD',
             'firstSnapshotFailure': getattr(e, 'first_snapshot_failure', None)})
        # Broker loss is authority loss. NEVER fallback to numeric/ambient kills.
        raise


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'identity':
        target = int(sys.argv[2])
        if not 2 <= target <= 2147483647: raise SystemExit(64)
        print(json.dumps(Kernel().identity(target), separators=(',', ':')))
    elif len(sys.argv) == 2 and sys.argv[1] == 'probe-hang':
        while True: time.sleep(1)
    elif len(sys.argv) == 2 and sys.argv[1] == 'probe-malformed':
        print('NOT_JSON_INSPECTION')
    elif len(sys.argv) > 3 and sys.argv[1] == 'bootstrap':
        if not Path(sys.argv[2]).is_absolute(): raise SystemExit(64)
        lease_file = os.environ.get('P6_REGISTERED_LEASE')
        if not lease_file or Path(lease_file).stat().st_size > 262144: raise SystemExit(77)
        lease = json.loads(Path(lease_file).read_text())
        command_hash = hashlib.sha256(json.dumps(sys.argv[2:], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        if (os.environ.get('P6_REGISTERED_RUN') != lease['runId'] or os.getppid() != lease['guard']['pid'] or
                os.getpgrp() != lease['anchor']['pid'] or os.getsid(0) != lease['anchor']['pid'] or
                command_hash != lease['commandSha256']): raise SystemExit(77)
        os.kill(os.getpid(), signal.SIGSTOP)
        os.execv(sys.argv[2], sys.argv[2:])
    else: main()
