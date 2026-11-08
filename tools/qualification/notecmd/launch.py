"""Own the isolated notice command.
Retain every actual child and capture.
"""
import time
BEGAN = time.monotonic_ns()
import ctypes
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import sys

HERE = Path(__file__).resolve().parent
LATCHED = set()
DIRECT = None
DIRECT_SIGNAL_ALLOWED = False
DIRECT_REAP_STARTED = False
WAITS = []
HELD = []
FINAL_ECHILD = False
LAUNCH_STARTED = False
WORK_FD = None
WORK_ID = None
EXTERNAL_ENTRY = None


def require(condition, message):
    if not condition:
        raise ValueError(message)


def hold(reason):
    if reason not in HELD and len(HELD) < 32:
        HELD.append(reason)
        print('Viewer notice HELD: ' + reason + '; retaining actual child ownership', file=sys.stderr, flush=True)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(131072), b''):
            value.update(block)
    return value.hexdigest()


def members(offer):
    for row in offer['members']:
        path = Path(row['path']); value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and
                str(path.resolve()) == row['realpath'] and value.st_size == row['bytes'] and
                oct(stat.S_IMODE(value.st_mode)) == row['mode'] and digest(path) == row['sha256'],
                'member mismatch: ' + str(path))


def verify_runtime():
    """Concrete retained host inventory, excluding site-packages under -S."""
    runtime = json.loads((HERE / 'runtime.dat').read_text())
    for link in runtime['symlinks']:
        path = Path(link['path'])
        require(path.is_symlink() and os.readlink(path) == link['target'] and str(path.resolve()) == link['realpath'], 'runtime link changed')
    for name in runtime['absentPaths']:
        path = Path(name)
        require(not path.exists() and not path.is_symlink(), 'optional runtime path appeared')
    for row in runtime['members']:
        path = Path(row['path']); value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and str(path.resolve()) == row['realpath'] and value.st_size == row['bytes'] and
                oct(stat.S_IMODE(value.st_mode)) == row['mode'] and digest(path) == row['sha256'], 'runtime input changed: ' + str(path))
    for tree in runtime['closedTrees']:
        root = Path(tree['path'])
        require(stat.S_ISDIR(root.lstat().st_mode) and root.resolve() == root, 'plain canonical runtime root')
        files, dirs = set(), set()
        for current, directories, names in os.walk(root, followlinks=False):
            if Path(current) == root:
                directories[:] = [name for name in directories if name not in tree.get('excludedTopDirectories', [])]
            for name in directories + names:
                path = Path(current) / name; mode = path.lstat().st_mode
                if stat.S_ISREG(mode): files.add(path.relative_to(root).as_posix())
                elif stat.S_ISDIR(mode): dirs.add(path.relative_to(root).as_posix())
                else: raise RuntimeError('runtime tree non-regular entry')
        require(files == set(tree['files']) and dirs == set(tree['directories']), 'complete scoped runtime tree changed')
    return dict(manifestSha256=digest(HERE / 'runtime.dat'), members=len(runtime['members']),
                scopedStdlibFiles=976, sitePackagesExcluded=True, links=len(runtime['symlinks']), absences=len(runtime['absentPaths']))

def latch(number, _frame):
    LATCHED.add(number)


def subreaper():
    require(sys.platform == 'linux' and ctypes.sizeof(ctypes.c_void_p) == 8 and
            ctypes.sizeof(ctypes.c_ulong) == 8 and ctypes.sizeof(ctypes.c_int) == 4, 'Linux LP64 ABI required')
    api = ctypes.CDLL('/usr/lib/x86_64-linux-gnu/libc.so.6', use_errno=True)
    api.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    api.prctl.restype = ctypes.c_int
    operations = []
    ctypes.set_errno(0); result = api.prctl(36, 1, 0, 0, 0)
    operations.append(dict(operation=36, argument=1, result=result, errno=ctypes.get_errno()))
    require(result == 0, 'subreaper SET refused before launch')
    value = ctypes.c_int(-1)
    ctypes.set_errno(0); result = api.prctl(37, ctypes.addressof(value), 0, 0, 0)
    operations.append(dict(operation=37, result=result, errno=ctypes.get_errno(), observedValue=value.value))
    require(result == 0 and value.value == 1, 'subreaper GET refused before launch')
    try:
        ready = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    except ChildProcessError:
        return operations
    # None also means a pre-existing live child, not an empty child set.
    raise RuntimeError('pre-existing child accounting before launch: ' + str(ready))


def identity(pid):
    # Only a PID returned by this process's actual WNOWAIT may be inspected.
    try:
        with Path('/proc/' + str(pid) + '/stat').open('rb') as source:
            raw = source.read(8193)
        text = raw.decode('ascii'); end = text.rfind(')'); fields = text[end+2:].split()
        with Path('/proc/' + str(pid) + '/cmdline').open('rb') as source:
            command = source.read(8193)
        require(end >= 0 and len(raw) + len(command) <= 8192, 'bounded owned identity')
        return dict(available=True, pid=pid, state=fields[0], ppid=int(fields[1]),
                    pgid=int(fields[2]), session=int(fields[3]), birthTick=int(fields[19]),
                    cmdlineHex=command.hex(), zombieArgvUnavailable=not bool(command))
    except (OSError, ValueError, IndexError, UnicodeError):
        return dict(available=False, pid=pid)


def own_all_children():
    """Sole WNOWAIT/pending specific consuming path, including adopted orphans.

    No Popen.poll/wait competitor, group kill or PID/name census. Handlers only
    latch. Numeric signal authority is irrevocably revoked BEFORE consumption;
    ECHILD/lost ownership cannot recreate it. Unknown live children stay owned.
    """
    global DIRECT_SIGNAL_ALLOWED, DIRECT_REAP_STARTED, FINAL_ECHILD
    forwarded = False
    pending = None
    while True:
        if time.monotonic_ns() - BEGAN >= 118000000000:
            hold('LAUNCHER_DEADLINE_HELD_REAP_ONLY')
        if LATCHED:
            hold('OUTER_INTERRUPTION_OR_ALARM')
        if (HELD or LATCHED) and DIRECT is not None and DIRECT_SIGNAL_ALLOWED and not DIRECT_REAP_STARTED and not forwarded:
            try:
                os.kill(DIRECT.pid, signal.SIGTERM)
            except ProcessLookupError:
                hold('ANCHORED_DIRECT_SIGNAL_NOT_DELIVERED')
            forwarded = True
        if pending is None:
            try:
                ready = os.waitid(os.P_ALL, 0, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            except InterruptedError:
                continue
            except ChildProcessError:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
                FINAL_ECHILD = True
                if DIRECT is not None and DIRECT.returncode is None:
                    # Internal suppression only; no fabricated observed status.
                    DIRECT.returncode = 255
                    hold('DIRECT_STATUS_LOST_ECHILD')
                return
            except OSError:
                hold('WAITID_UNKNOWN_OWNERSHIP_RETAINED')
                time.sleep(.01); continue
            if ready is None:
                FINAL_ECHILD = False
                if HELD:
                    # Retain actual subreaper ownership, without deadline/price/
                    # extinction credit, until a real child exit/ECHILD.
                    pass
                time.sleep(.01); continue
            info = identity(ready.si_pid)
            pending = dict(pid=ready.si_pid, identity=info)
            if DIRECT is not None and ready.si_pid == DIRECT.pid:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
        try:
            pid, raw, usage = os.wait4(pending['pid'], 0)
        except InterruptedError:
            continue  # same pending identity; no clock reset or signal revival
        except ChildProcessError:
            if DIRECT is not None and pending['pid'] == DIRECT.pid:
                DIRECT_SIGNAL_ALLOWED = False; DIRECT_REAP_STARTED = True
                DIRECT.returncode = 255
            hold('PENDING_OWNED_STATUS_LOST_ECHILD')
            pending = None; continue
        except OSError:
            hold('PENDING_WAIT_UNKNOWN_REAP_ONLY')
            time.sleep(.01); continue
        if DIRECT is not None and pid == DIRECT.pid:
            # Authority was already revoked before the kernel consumed status.
            DIRECT.returncode = os.waitstatus_to_exitcode(raw)
        require(pid == pending['pid'], 'actual consuming child identity changed')
        row = dict(pid=pid, rawStatus=raw, terminal=os.waitstatus_to_exitcode(raw),
                   identity=pending['identity'], rusage={name: getattr(usage, name) for name in dir(usage) if name.startswith('ru_')})
        if len(WAITS) < 32:
            WAITS.append(row)
        else:
            hold('WAIT_RETENTION_OVERFLOW')
        if not pending['identity']['available'] or pending['identity'].get('ppid') != os.getpid():
            hold('OWNED_IDENTITY_UNCONFIRMED')
        if DIRECT is None or pid != DIRECT.pid:
            hold('UNEXPECTED_ADOPTED_CHILD_WAITED')
        pending = None


def durable_regular(path, maximum, mode):
    value = path.lstat()
    require(stat.S_ISREG(value.st_mode) and value.st_nlink == 1 and
            stat.S_IMODE(value.st_mode) == mode and value.st_size <= maximum and
            path.resolve() == path, 'bounded plain durable output')
    def identity(info):
        return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size,
                info.st_mtime_ns, info.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(identity(before) == identity(value), 'opened output identity')
        os.fsync(fd)
        count = 0; hashed = hashlib.sha256()
        while True:
            block = os.read(fd, min(131072, maximum + 1 - count))
            if block == b'': break
            count += len(block); require(count <= maximum, 'durable output cap')
            hashed.update(block)
        require(count == before.st_size and identity(os.fstat(fd)) == identity(before) ==
                identity(path.lstat()), 'durable output stable through actual EOF')
    finally:
        os.close(fd)
    return dict(bytes=count, sha256=hashed.hexdigest(), regularFileReadEOF=True, fsyncCompleted=True)


def directory_row(path, value=None):
    path = Path(path)
    value = path.lstat() if value is None else value
    require(stat.S_ISDIR(value.st_mode) and path.resolve() == path, 'plain canonical parent')
    return dict(path=str(path), realpath=str(path), device=str(value.st_dev), inode=str(value.st_ino),
                mode=oct(stat.S_IMODE(value.st_mode)), uid=str(value.st_uid), gid=str(value.st_gid))


def parents(offer):
    for row in offer['parents']:
        require(directory_row(row['path']) == row, 'exact parent identity')
    for tree in [offer['closedSourceDirectory'],offer['closedComponentDirectory']]:
        require(Path(tree['path']).resolve() == Path(tree['path']) and
                sorted(os.listdir(tree['path'])) == sorted(tree['files']), 'closed source directory names')
    for path in offer['packageAbsences']:
        require(not os.path.lexists(path), 'package metadata absence')


def work_identity(offer):
    require(WORK_FD is not None and WORK_ID is not None, 'owned work directory')
    path = Path(offer['work'])
    require(directory_row(path) == WORK_ID and directory_row(path, os.fstat(WORK_FD)) == WORK_ID,
            'opened work directory remains the path')
    return WORK_ID


def read_regular(path, cap):
    path = Path(path); before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and
            before.st_size <= cap and path.resolve() == path, 'bounded plain JSON/data')
    def identity(st):
        return (st.st_dev, st.st_ino, st.st_mode, st.st_nlink, st.st_size, st.st_mtime_ns, st.st_ctime_ns)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        require(identity(os.fstat(fd)) == identity(before), 'opened data identity')
        chunks = []; total = 0
        while True:
            block = os.read(fd, min(65536, cap + 1 - total))
            if not block: break
            total += len(block); require(total <= cap, 'complete data bound'); chunks.append(block)
        require(total == before.st_size and identity(os.fstat(fd)) == identity(before) ==
                identity(path.lstat()), 'stable complete JSON/data EOF')
        return b''.join(chunks)
    finally:
        os.close(fd)


# Flush every present partial output.
# Only the exact normal set can pass.
def durable_outputs(offer):
    root = Path(offer['work']); work_identity(offer)
    caps = offer['caps']['work']
    rows = []
    names = os.listdir(root)
    require(len(names) <= 4 and set(names) <= set(caps), 'finite declared work names')
    for name in sorted(names):
        audited = durable_regular(root / name, caps[name], 0o600)
        rows.append(dict(path=name, **audited))
    os.fsync(WORK_FD)
    work_identity(offer); parents(offer)
    return dict(files=len(rows), directories=1, rows=rows, fileFsyncAndEOFCompleted=True,
                directoryFsyncCompleted=True, scope='post-wait file and capture-parent closure before SELF')


def output_tree(offer, audit, stdout):
    root = Path(offer['work'])
    require(set(os.listdir(root)) == {'context.dat', 'result.dat', 'ended.dat'} and audit['files'] == 3,
            'exact normal three-file set, no failure')
    raw = {n: read_regular(root / n, offer['caps']['work'][n]) for n in ['context.dat', 'result.dat', 'ended.dat']}
    audited = {row['path']: row for row in audit['rows']}
    for name, value in raw.items():
        require(len(value) == audited[name]['bytes'] and hashlib.sha256(value).hexdigest() == audited[name]['sha256'],
                'same durable bytes parsed')
    context, result, ended = [json.loads(raw[n]) for n in ['context.dat', 'result.dat', 'ended.dat']]
    require(set(context) == {'kind','pid','ppid','guardPid','executable','argv','execArgv','environment','cwd',
            'offerSha256','childDenied','filesystemSandboxClaimed','sourceChecks','workParent',
            'generatedSourceSha256','generatedUrlSha256','nativeExecution','browserExecution','productAcceptance'},
            'complete actual context')
    node = context['pid']; guard = context['guardPid']
    require(type(node) is int and type(guard) is int and node > 1 and guard > 1 and
            context['ppid'] == guard and len({os.getpid(), DIRECT.pid, node, guard}) == 4,
            'actual distinct direct guard-parent identities')
    env = dict(offer['environment'], NOTICE_OFFER_SHA=digest(HERE/'offer.dat'), ORIGO_GUARD=str(guard),
               NODE_OPTIONS='--max-old-space-size=64')
    require(context['kind'] == 'NOTICE_SOURCE_CONTEXT' and context['executable'] == offer['nodeIdentity']['realpath'] and
            context['argv'] == offer['leafProcessArgv'] and context['execArgv'] == offer['nodeFlags'] and
            context['environment'] == env and context['cwd'] == offer['cwd'] and
            context['offerSha256'] == digest(HERE/'offer.dat') and context['childDenied'] is True and
            context['sourceChecks'] == 14 and context['workParent'] == work_identity(offer) and
            context['generatedSourceSha256'] == offer['generated']['sourceSha256'] and
            context['generatedUrlSha256'] == offer['generated']['urlSha256'] and
            all(context[k] is False for k in ['filesystemSandboxClaimed','nativeExecution','browserExecution','productAcceptance']),
            'exact permission, source, environment and parent context')
    expected_ended = dict(kind='NOTICE_ADAPTER_IMPORT_RETURNED', pid=node, ppid=guard, guardPid=guard,
            contextSha256=hashlib.sha256(raw['context.dat']).hexdigest(), offerSha256=digest(HERE/'offer.dat'),
            adapterImportCompleted=True, sourcePostflightComplete=True, exitCode=0, interpreterShutdownPending=True,
            captureParentFsyncClaimed=False, nativeExecution=False, productAcceptance=False)
    require(ended == expected_ended, 'import return is not interpreter shutdown or parent fsync')
    expected_raw = offer['expectedAggregateUtf8'].encode('utf8')
    require(len(raw['result.dat']) == offer['expectedAggregateBytes'] and
            hashlib.sha256(raw['result.dat']).hexdigest() == offer['expectedAggregateSha256'] and
            raw['result.dat'] == expected_raw and result == offer['expectedAggregate'],
            'all eleven complete literal observations and exact bytes')
    require(result['complete'] is True and result['firstReason'] is None and len(result['observations']) == 11 and
            [r['id'] for r in result['observations']] == offer['observationIds'] and
            all(r['matched'] is True for r in result['observations']), 'ordered eleven observed outcomes')
    markers = [json.loads(line) for line in stdout.decode('utf8').splitlines() if line.startswith('{')]
    marker = dict(kind='NOTICE_ADAPTER_RETURNED', pid=node, ppid=guard, guardPid=guard,
                  adapterImportCompleted=True, exitCode=0, interpreterShutdownPending=True)
    require(markers == [marker] and len((json.dumps(marker, separators=(',', ':'))+'\n').encode()) <= 512,
            'one bounded actual import-return marker')
    return dict(files=3, observations=11, sourceFiles=14, childDenied=True, modelPid=node, guardPid=guard,
                resultSha256=hashlib.sha256(raw['result.dat']).hexdigest(), resultBytes=len(raw['result.dat']),
                generatedSourceSha256=offer['generated']['sourceSha256'], generatedUrlSha256=offer['generated']['urlSha256'],
                nativeExecution=False, browserExecution=False, productionWitness=False, receivingM3Closed=False)


def external_elapsed():
    require(EXTERNAL_ENTRY is not None, 'original external clock')
    return time.monotonic_ns() - EXTERNAL_ENTRY


def main():
    global DIRECT, DIRECT_SIGNAL_ALLOWED, LAUNCH_STARTED, WORK_FD, WORK_ID, EXTERNAL_ENTRY
    require(len(sys.argv) == 2 and 'ORIGO_GUARD' not in os.environ and sys.platform == 'linux', 'Linux outside a guard')
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    for number in (signal.SIGALRM, signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(number, latch)
    remaining = 118 - (time.monotonic_ns() - BEGAN) / 1e9
    require(remaining > 0, 'original deadline before setup')
    signal.setitimer(signal.ITIMER_REAL, remaining)
    raw_offer = read_regular(HERE/'offer.dat', 2097152); offer = json.loads(raw_offer)
    require(stat.S_IMODE((HERE/'offer.dat').stat().st_mode) == 0o644, 'maintained offer mode')
    require(offer['state'] == 'SOURCE_ONLY_UNRUN_NOT_ALLOCATED' and offer['runtimeAuthority'] is False and
            offer['allocationIssued'] is False, 'inactive source offer')
    allocation_path = Path(sys.argv[1]); require(str(allocation_path) == offer['allocation'], 'fixed actual allocation')
    allocation_raw = read_regular(allocation_path, 16384); allocation = json.loads(allocation_raw)
    require(oct(stat.S_IMODE(allocation_path.stat().st_mode)) == '0o600' and
            allocation.get('kind') == 'VIEWER_NOTICE11_ALLOCATION' and allocation.get('runtimeAuthority') is True and
            allocation.get('offerSha256') == hashlib.sha256(raw_offer).hexdigest() and
            allocation.get('launcherSha256') == digest(Path(__file__)) and allocation.get('budget') == offer['budget'] and
            allocation.get('sourceBasisCommit') == offer['sourceBasisCommit'], 'separate exact actual grant')
    require(isinstance(allocation.get('packetCommit'), str) and len(allocation['packetCommit']) == 40 and
            all(c in '0123456789abcdef' for c in allocation['packetCommit']), 'published packet identity')
    pre_path = Path(offer['runtimePreflight']); pre_raw = read_regular(pre_path, 32768); pre = json.loads(pre_raw)
    require(oct(stat.S_IMODE(pre_path.stat().st_mode)) == '0o600' and
            hashlib.sha256(pre_raw).hexdigest() == allocation.get('runtimePreflightSha256') and
            pre['kind'] == 'VIEWER_NOTICE11_ROOT_DATA_HOST_PREFLIGHT' and pre['completedBeforePythonLaunch'] is True and
            pre['originalOuterGuardEnvironmentAbsent'] is True and pre['offerSha256'] == digest(HERE/'offer.dat') and
            pre['runtimeManifestSha256'] == digest(HERE/'runtime.dat') and
            all(pre[k] is True for k in ['allMemberBytesModesRealpathsVerified','allScopedTreeSetsTypesVerified',
                'allRuntimeLinksAndAbsencesVerified','allSourceGeneratedUrlAndParentsVerified','freshNamespacesVerified']) and
            pre['packetCommit'] == allocation['packetCommit'], 'original before-start observation')
    require(pre['hostContext'] == offer['hostContext'] and
            Path('/proc/sys/kernel/random/boot_id').read_text().strip() == pre['hostContext']['bootId'] and
            Path('/proc/sys/kernel/osrelease').read_text().strip() == pre['hostContext']['kernelRelease'], 'same host clock context')
    full = pre['fullObservation']
    require(full['path'] == offer['fullObservation'] and full['mode'] == '0o600' and
            type(full['bytes']) is int and 0 < full['bytes'] <= 4194304 and
            oct(stat.S_IMODE(Path(full['path']).stat().st_mode)) == '0o600' and
            len(read_regular(full['path'],4194304)) == full['bytes'] and digest(Path(full['path'])) == full['sha256'],
            'complete original observation record')
    EXTERNAL_ENTRY = pre['externalEntryMonotonicNs']
    require(type(EXTERNAL_ENTRY) is int and 0 < EXTERNAL_ENTRY <= BEGAN and external_elapsed() < 120000000000,
            'original external interval includes startup')
    require(type(pre['dataSelfPeakBytes']) is int and 0 < pre['dataSelfPeakBytes'] <= 629145600,
            'sequential original DATA peak')
    require(dict(os.environ) == offer['environment'] and sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode and
            sys.executable == offer['python'] and sys.argv == [str(HERE/'launch.py'), offer['allocation']] and
            os.getcwd() == offer['cwd'], 'exact isolated cleared owner invocation')
    runtime_before = verify_runtime(); members(offer); parents(offer)
    paths = [Path(offer[k]) for k in ['stdout','stderr','receipt','guardLog']]
    require(len(set(paths)) == 4 and not any(os.path.lexists(p) for p in paths+[Path(offer['work'])]), 'fresh first-result namespace')
    require(all(str(p.parent) == '/workspace/scratch' for p in paths), 'fixed capture parent')
    operations = subreaper()
    require(not LATCHED and time.monotonic_ns()-BEGAN < 5000000000, 'five-second prelaunch reserve')
    receipt = dict(state='HELD_INCOMPLETE', allocationSha256=hashlib.sha256(allocation_raw).hexdigest(),
        packetCommit=allocation['packetCommit'], offerSha256=digest(HERE/'offer.dat'),
        originalPreflightSha256=hashlib.sha256(pre_raw).hexdigest(), runtimePreflight=runtime_before,
        subreaperOperations=operations, argv=offer['argv'], cwd=offer['cwd'], environment=offer['environment'],
        nativeExecution=False, browserExecution=False, receivingM3Closed=False, wholeIntervalRequiresExternalReadback=True)
    code = 70
    try:
        root = Path(offer['work']); root.mkdir(mode=0o700); os.chmod(root, 0o700)
        WORK_FD = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        WORK_ID = directory_row(root, os.fstat(WORK_FD)); work_identity(offer)
        with paths[0].open('xb') as out, paths[1].open('xb') as err:
            os.fchmod(out.fileno(), 0o600); os.fchmod(err.fileno(), 0o600)
            LAUNCH_STARTED = True
            DIRECT = subprocess.Popen(offer['argv'], cwd=offer['cwd'],
                env=dict(offer['environment'], NOTICE_OFFER_SHA=digest(HERE/'offer.dat')),
                stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, umask=0o077)
            DIRECT_SIGNAL_ALLOWED = True; receipt['outerChildPid'] = DIRECT.pid
            own_all_children()
            out.flush(); err.flush(); os.fsync(out.fileno()); os.fsync(err.fileno())
        receipt['launchThroughCaptureCloseNs'] = time.monotonic_ns()-BEGAN
        require(FINAL_ECHILD and not HELD and not LATCHED and len(WAITS) == 1 and WAITS[0]['pid'] == DIRECT.pid,
                'normal sole owned ending')
        waited = WAITS[0]; receipt['terminal'] = waited['terminal']
        members(offer); receipt['runtimePostflight'] = verify_runtime(); parents(offer)
        receipt['captures'] = [dict(path=str(p), **durable_regular(p, 4194304, 0o600)) for p in paths[:2]]
        receipt['guardCapture'] = dict(path=str(paths[3]), **durable_regular(paths[3], 65536, 0o600))
        audit = durable_outputs(offer); receipt['durableOutputAudit'] = audit
        require(waited['terminal'] == 0 and os.WIFEXITED(waited['rawStatus']) and os.WEXITSTATUS(waited['rawStatus']) == 0 and
                waited['identity']['available'] is True and waited['identity']['state'] == 'Z' and
                waited['identity']['cmdlineHex'] == '', 'actual raw-zero anchored timeout')
        stdout = read_regular(paths[0], 4194304); stderr = read_regular(paths[1], 4194304)
        require(stderr == b'', 'normal stderr is empty')
        guard_rows = [json.loads(line) for line in read_regular(paths[3],65536).splitlines()]
        require(len(guard_rows) == 2 and [r['event'] for r in guard_rows] == ['start','end'] and
            all(r['name'] == offer['guardName'] and r['command'] == offer['normalizedLeaf'] and
                r['limitMB'] == 600 and r['heapMB'] == 64 and isinstance(r['at'],str) and len(r['at']) == 24 for r in guard_rows) and
            guard_rows[0]['waitedSeconds'] == 0 and guard_rows[1]['code'] == 0 and guard_rows[1]['outcome'] == 'exit 0',
            'complete normal guard joins')
        receipt['outputRetention'] = output_tree(offer, audit, stdout)
        parents(offer); work_identity(offer)
        require(stat.S_IMODE((HERE/'offer.dat').stat().st_mode) == 0o644 and
                all(stat.S_IMODE(Path(p).stat().st_mode) == 0o600 for p in
                    [allocation_path,pre_path,full['path']]), 'source and private authority modes unchanged')
        require(read_regular(HERE/'offer.dat',2097152) == raw_offer and
                read_regular(allocation_path,16384) == allocation_raw and read_regular(pre_path,32768) == pre_raw and
                digest(Path(full['path'])) == full['sha256'], 'source offer and actual authority records unchanged')
        os.close(WORK_FD); WORK_FD = None
        require(not LATCHED and time.monotonic_ns()-BEGAN < 118000000000 and external_elapsed() < 120000000000,
                'complete containing intervals before SELF')
        own_usage = resource.getrusage(resource.RUSAGE_SELF); own = own_usage.ru_maxrss*1024
        child = waited['rusage']['ru_maxrss']*1024
        require(own > 0 and child > 0, 'actual SELF and specific waited peak')
        upper = own+4*child+8388608
        containing = max(upper, pre['dataSelfPeakBytes'])
        receipt['normalWholeActorPrice'] = dict(actorBound=5, launcherSelfPeakBytes=own,
            launcherSelfRawUsage={n:getattr(own_usage,n) for n in dir(own_usage) if n.startswith('ru_')},
            outerWaitedPeakBytes=child, finalIoReserveBytes=8388608, conservativeBytes=upper,
            sequentialOriginalDataPeakBytes=pre['dataSelfPeakBytes'], containingBytes=containing,
            limitBytes=629145600, formula='O+4*T+8MiB', aggregateChildrenIgnored=True)
        require(containing <= 629145600, 'whole price held')
        receipt['state'] = 'NOTICE11_TERMINAL_PENDING_INDEPENDENT_REVIEW'; code = 0
    except BaseException as error:
        hold(type(error).__name__ + ': ' + str(error)); code = 70
        print('HELD: '+str(error), file=sys.stderr, flush=True)
    finally:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('EXCEPTIONAL_OWNERSHIP_DRAIN'); own_all_children()
        if WORK_FD is not None:
            if FINAL_ECHILD or not LAUNCH_STARTED:
                if 'durableOutputAudit' not in receipt:
                    try:
                        receipt['partialOutputAudit'] = durable_outputs(offer)
                    except BaseException as audit_error:
                        receipt['partialOutputAuditError'] = (type(audit_error).__name__+': '+str(audit_error))[:1024]
                partial = []
                for path, cap in [(paths[0],4194304),(paths[1],4194304),(paths[3],65536)]:
                    if os.path.lexists(path):
                        try:
                            partial.append(dict(path=str(path), **durable_regular(path,cap,0o600)))
                        except BaseException as audit_error:
                            partial.append(dict(path=str(path), auditError=(type(audit_error).__name__+': '+str(audit_error))[:1024]))
                if 'captures' not in receipt or 'guardCapture' not in receipt:
                    receipt['partialRawAudits'] = partial
            os.close(WORK_FD); WORK_FD = None
        receipt.update(waits=WAITS, finalECHILD=FINAL_ECHILD, signals=sorted(LATCHED), held=HELD,
            processExtinctionClaimed=False, resourceReleaseAccepted=False, elapsedBeforeReceiptWriteNs=time.monotonic_ns()-BEGAN,
            externalElapsedBeforeReceiptWriteNs=external_elapsed())
        if HELD or LATCHED:
            receipt['state'] = 'HELD_ACTUAL_WAITED_ENDING_PENDING_REVIEW' if DIRECT is not None else 'HELD_PRELAUNCH_NO_CHILD_CREATED'
            code = 70
        receipt['terminalReturned'] = code
        final_blob = (json.dumps(receipt,separators=(',', ':'),allow_nan=False)+'\n').encode()
        require(len(final_blob) <= 65536, '64 KiB final receipt')
        fd = os.open(paths[2],os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            os.fchmod(fd,0o600); rest = memoryview(final_blob)
            while rest:
                n = os.write(fd,rest); require(n > 0,'complete final receipt write'); rest = rest[n:]
            os.fsync(fd)
        finally: os.close(fd)
        after = time.monotonic_ns()-BEGAN; outside = external_elapsed()
        if LATCHED or after >= 118000000000 or outside >= 120000000000:
            hold('FINALISATION_DEADLINE_OR_INTERRUPTION'); code = 70
        print(json.dumps(dict(state='OUTER_RECEIPT_FSYNCED',terminal=code,elapsedThroughReceiptFsyncNs=after,
            externalElapsedThroughReceiptFsyncNs=outside,under120Seconds=outside < 120000000000)),flush=True)
        if LATCHED or time.monotonic_ns()-BEGAN >= 118000000000 or external_elapsed() >= 120000000000: code = 70
        signal.setitimer(signal.ITIMER_REAL,0)
    return code


if __name__ == '__main__':
    try:
        result = main()
    except BaseException:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('TOPLEVEL_EXCEPTION_OWNERSHIP_DRAIN'); own_all_children()
        if WORK_FD is not None:
            os.close(WORK_FD); WORK_FD = None
        raise
    else:
        sys.exit(result)
