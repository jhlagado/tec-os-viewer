"""Viewer M0 source-policy model.
The outer owns every actual child.
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


def require(condition, message):
    if not condition:
        raise ValueError(message)


def hold(reason):
    if reason not in HELD and len(HELD) < 32:
        HELD.append(reason)
        print('Viewer M0 HELD: ' + reason + '; retaining actual child ownership', file=sys.stderr, flush=True)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(131072), b''):
            value.update(block)
    return value.hexdigest()


def members(offer):
    for row in offer['members']:
        path = Path(row['path']); value = path.lstat()
        require(stat.S_ISREG(value.st_mode) and value.st_size == row['bytes'] and
                oct(stat.S_IMODE(value.st_mode)) == row['mode'] and digest(path) == row['sha256'], 'member mismatch: ' + str(path))



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

def save(path, value):
    with path.open('x') as target:
        json.dump(value, target, indent=2, allow_nan=False)
        target.write('\n'); target.flush(); os.fsync(target.fileno())


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


def output_tree(offer):
    root = Path(offer['work'])
    require(stat.S_ISDIR(root.lstat().st_mode) and stat.S_IMODE(root.stat().st_mode) == 0o700,
            'private plain model output')
    sources = offer['sourceRows'] + [dict(path='offer.dat', bytes=(HERE/'offer.dat').stat().st_size,
                                        sha256=digest(HERE/'offer.dat'))]
    expected = {'readings.dat', 'inputs.dat', 'result.dat', 'files.dat', 'depnew.dat'}
    expected.update('source/' + row['path'] for row in sources)
    expected.update('readings/c' + str(i).zfill(2) + '.dat' for i in range(1, 35))
    expected.update('notice/' + name for name in offer['noticeOutputs'])
    actual = set()
    directories = set()
    for current, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            path = Path(current)/name; value = path.lstat()
            relative = path.relative_to(root).as_posix()
            require(value.st_nlink == 1 if stat.S_ISREG(value.st_mode) else stat.S_ISDIR(value.st_mode), 'plain output entry')
            if stat.S_ISDIR(value.st_mode):
                require(stat.S_IMODE(value.st_mode) == 0o700, 'private output directory')
                directories.add(relative)
            else:
                require(stat.S_ISREG(value.st_mode) and stat.S_IMODE(value.st_mode) == 0o600, 'private regular output')
                actual.add(relative)
    require(directories == {'source', 'source/inputs', 'readings', 'notice'} and actual == expected,
            'complete finite output sets, no first failure')
    inventory_path = root/'files.dat'
    require(inventory_path.stat().st_size <= offer['caps']['inventory'], 'inventory cap')
    inventory = json.loads(inventory_path.read_bytes())
    require(inventory['kind'] == 'M0_OUTPUT_INVENTORY' and inventory['excludesOnlySelf'] == 'files.dat', 'inventory schema')
    retained = inventory['rows']
    require(len(retained) == len(expected)-1 and {row['path'] for row in retained} == expected-{'files.dat'}, 'complete inventory rows')
    for row in retained:
        name = row['path']; path = root/name
        cap = offer['caps']['sourceFile'] if name.startswith('source/') else (
            offer['caps']['caseFile'] if name.startswith('readings/') else (
            offer['caps']['noticeFile'] if name.startswith('notice/') else offer['caps'].get(
            {'readings.dat':'readings','inputs.dat':'identities','result.dat':'result','depnew.dat':'dependencyFile'}[name])))
        require(0 < path.stat().st_size <= cap and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'retained bytes ' + name)
    for row in sources:
        path = root/'source'/row['path']
        require(path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'staged source exact')
    cases = json.loads((HERE/'cases.dat').read_bytes())['hostCases']
    oracles = json.loads((HERE/'oracles.dat').read_bytes())
    report = json.loads((root/'readings.dat').read_bytes())
    rows = report['rows']
    declarations = cases['widths'] + cases['notices'] + cases['identities']
    require(report['kind'] == 'M0_MODEL_READINGS' and report['total'] == 34 and len(rows) == 34 and
            [row['id'] for row in rows] == [item['id'] for item in declarations], 'all 34 ordered readings')
    dependency_raw = (HERE/'deps.dat').read_bytes()
    descriptor = json.loads(dependency_raw)
    require(hashlib.sha256(dependency_raw).hexdigest() == offer['identityExpected']['dependency'] ==
            oracles['dependencyDescriptorSha256'], 'positive structured dependency seal')
    canonical = (HERE/'inputs/notice.txt').read_text()
    notice_paths = {'directory-positive':['dir.html','dir.txt'], 'standalone-positive':['one.html'],
                    'directory-escaping':['escdir.html','escdir.txt'], 'standalone-escaping':['escone.html']}
    for index, (row, item) in enumerate(zip(rows, declarations), 1):
        require(json.loads((root/('readings/c'+str(index).zfill(2)+'.dat')).read_bytes()) == row and row['matched'] is True,
                'complete individual case ' + item['id'])
        result = row['actual']
        if index <= 17:
            selected = item.get('expectedSession', item['expectedInitial'])
            require(row['family'] == 'width' and row['declared'] == item and result['initial'] == item['expectedInitial'] and
                    result['session'] == result['selector'] == result['cardRequest'] == selected, 'literal width oracle')
            if 'select' in item:
                require(result['stored'] == item['expectedStored'] and result['reload'] == item['expectedReload'] and
                        result['persisted'] is item.get('persistenceClaim', True), 'literal persistence oracle')
        elif index <= 27:
            require(row['family'] == 'notice', 'notice family')
            spec = oracles['noticeMutations'].get(item.get('mutation'))
            if spec:
                require(row['mutation'] == spec and result == dict(rejected=True, firstReason=spec['reason']) and row['artifacts'] == [], 'specific notice first reason')
            else:
                synthetic = 'fixture' in item
                text = oracles['syntheticText'] if synthetic else canonical
                html = oracles['syntheticHtml'] if synthetic else oracles['prefix']+text+oracles['suffix']
                require(row['synthetic'] is synthetic and row['decodedText'] == text and
                        result == dict(html=html, external=text if item['format']=='directory' else None), 'literal notice text and wrapper')
                names = notice_paths[item['id']]
                require(row['artifacts'] == ['notice/'+name for name in names] and (root/'notice'/names[0]).read_bytes() == html.encode(), 'notice HTML artifact')
                if len(names) == 2:
                    require((root/'notice'/names[1]).read_bytes() == text.encode(), 'directory notice text artifact')
        else:
            spec = oracles['identityMutations'][item['id']]
            require(row['family'] == 'identity' and row['mutation'] == spec and
                    result == dict(rejected=True, firstReason=spec['reason']), 'specific identity first reason')
            require(row['observedPicoVersion'] == (4 if spec['field']=='picoVersion' else 3), 'one version mutation')
            if spec['field'] == 'dependency':
                changed = json.loads(dependency_raw)
                matches = [item for item in changed['resolvedFiles'] if item['id'] == spec['rowId']]
                require(len(matches) == 1 and matches[0]['path'] == spec['path'] and matches[0]['sha256'] == spec['originalSha256'], 'named actual original dependency row')
                original = dict(matches[0]); matches[0]['sha256'] = spec['alteredSha256']
                require(row['originalRow'] == original and row['alteredRow'] == matches[0] and
                        json.loads((root/'depnew.dat').read_bytes()) == changed, 'sole resolved-row hash contrast')
                artifact = row['descriptorArtifact']
                require(artifact == dict(path='depnew.dat', bytes=(root/'depnew.dat').stat().st_size,
                        sha256=digest(root/'depnew.dat')) and row['actualHash'] is None, 'complete altered descriptor retained')
                joins = row['positiveDependencyJoins']
                require(joins == dict(descriptorSha256=hashlib.sha256(dependency_raw).hexdigest(),
                        actualFileJoins=len(descriptor['resolvedFiles']), viewerFiles=175, hostOnly=True,
                        browserInstallQualified=False), 'actual positive file-join completion before contrast')
            elif spec['field'] != 'picoVersion':
                body = bytearray((HERE/offer['identityBodies'][spec['field']]).read_bytes()); body[0] ^= 1
                require(row['actualHash'] == hashlib.sha256(body).hexdigest() and row['originalRow'] is None and
                        row['alteredRow'] is None and row['descriptorArtifact'] is None and row['positiveDependencyJoins'] is None, 'one-byte body mutation')
            else:
                require(row['actualHash'] is None and row['originalRow'] is None and row['alteredRow'] is None and
                        row['descriptorArtifact'] is None and row['positiveDependencyJoins'] is None, 'version-only mutation')
    inputs = json.loads((root/'inputs.dat').read_bytes())
    require(inputs['kind'] == 'M0_ACTUAL_SOURCE_IDENTITIES' and inputs['sourceRows'] == sources and
            inputs['identityExpected'] == offer['identityExpected'] and inputs['noticeBytes'] == 2642 and
            inputs['noticeSha256'] == oracles['noticeSha256'] and inputs['fixtureBodiesAreHttpObservations'] is False, 'actual identity account')
    result = json.loads((root/'result.dat').read_bytes())
    require(result['kind'] == 'M0_MODEL_RESULT_PENDING_REVIEW' and result['total'] == 34 and result['widths'] == 17 and
            result['notices'] == 10 and result['identities'] == 7 and result['childDenied'] is True and
            result['offerSha256'] == digest(HERE/'offer.dat') and result['argv'] == offer['leafArgv'][:1]+offer['leafArgv'][-1:] and
            result['execArgv'] == offer['nodeFlags'], 'actual leaf command joins')
    require(type(result['pid']) is int and type(result['guardPid']) is int and result['pid'] > 1 and
            result['guardPid'] == result['ppid'] and result['guardPid'] > 1 and result['pid'] != result['guardPid'] and
            result['pid'] != DIRECT.pid and result['guardPid'] != DIRECT.pid, 'direct guard parent metadata')
    require(result['dependencyJoins'] == dict(descriptorSha256=hashlib.sha256(dependency_raw).hexdigest(),
            actualFileJoins=len(descriptor['resolvedFiles']), viewerFiles=175, hostOnly=True, browserInstallQualified=False), 'final positive dependency joins')
    environment = dict(offer['environment'], M0_OFFER_SHA=digest(HERE/'offer.dat'), ORIGO_GUARD=str(result['guardPid']),
                       NODE_OPTIONS='--max-old-space-size=64')
    require(result['environment'] == environment and all(result[key] is False for key in
            ('nativeExecution','browserExecution','productionWitness','D','B','A5')), 'closed actual environment and model scope')
    return dict(files=len(expected), caseReadings=34, sourceCopies=len(sources), noticeFiles=6,
                inventorySha256=digest(inventory_path), resultSha256=digest(root/'result.dat'),
                modelPid=result['pid'], guardPid=result['guardPid'], childDenied=True,
                modelOnly=True, nativeExecution=False, browserExecution=False)


def main():
    global DIRECT, DIRECT_SIGNAL_ALLOWED, LAUNCH_STARTED
    require(len(sys.argv) == 2 and 'ORIGO_GUARD' not in os.environ and sys.platform == 'linux', 'Linux allocation outside guard')
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    for number in (signal.SIGALRM, signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
        signal.signal(number, latch)
    remaining = 118 - (time.monotonic_ns() - BEGAN) / 1e9
    require(remaining > 0, 'deadline before setup')
    signal.setitimer(signal.ITIMER_REAL, remaining)
    offer = json.loads((HERE / 'offer.dat').read_text())
    allocation_path = Path(sys.argv[1]); require(str(allocation_path) == offer['allocation'], 'exact allocation path')
    require(allocation_path.stat().st_size <= 16384, 'bounded allocation')
    allocation = json.loads(allocation_path.read_text())
    require(allocation.get('kind') == 'VIEWER_M0_34_ALLOCATION' and allocation.get('runtimeAuthority') is True and
            allocation.get('offerSha256') == digest(HERE / 'offer.dat') and allocation.get('launcherSha256') == digest(Path(__file__)) and
            allocation.get('budget') == offer['budget'] and allocation.get('sourceBasisCommit') == offer['sourceBasisCommit'], 'exact root allocation')
    require(isinstance(allocation.get('packetCommit'), str) and len(allocation['packetCommit']) == 40 and
            all(ch in '0123456789abcdef' for ch in allocation['packetCommit']), 'actual published identity')
    preflight_path = Path(offer['runtimePreflight'])
    require(preflight_path.stat().st_size <= 32768 and digest(preflight_path) == allocation['runtimePreflightSha256'], 'root pre-start host observation')
    preflight = json.loads(preflight_path.read_text())
    require(preflight['kind'] == 'VIEWER_M0_ROOT_DATA_HOST_PREFLIGHT' and preflight['completedBeforePythonLaunch'] is True and
            preflight['originalOuterGuardEnvironmentAbsent'] is True and preflight['runtimeManifestSha256'] == digest(HERE / 'runtime.dat') and
            preflight['allMemberBytesModesRealpathsVerified'] is True and preflight['allScopedTreeSetsTypesVerified'] is True and
            preflight['allRuntimeLinksAndAbsencesVerified'] is True, 'pre-start runtime predicates')
    require(dict(os.environ) == offer['environment'] and sys.flags.isolated == 1 and sys.flags.no_site == 1 and sys.dont_write_bytecode, 'exact isolated cleared launch')
    require(sys.executable == offer['python'] and sys.argv == [str(HERE/'launch.py'), offer['allocation']], 'exact outer argv')
    runtime_before = verify_runtime(); members(offer)
    paths = [Path(offer[k]) for k in ('stdout','stderr','receipt','guardLog')]
    require(len(set(paths)) == 4 and not any(p.exists() or p.is_symlink() for p in paths + [Path(offer['work'])]), 'fresh first-result namespace')
    require(all(str(p.parent.resolve()) == '/workspace/scratch' for p in paths), 'capture parent')
    subreaper_operations = subreaper()
    require(not LATCHED and time.monotonic_ns() - BEGAN < 5000000000, 'prelaunch five-second reserve or signal')
    receipt = dict(state='HELD_INCOMPLETE', allocation=dict(path=str(allocation_path), packetCommit=allocation['packetCommit'], kind=allocation['kind']),
                   allocationSha256=digest(allocation_path), offerSha256=digest(HERE / 'offer.dat'),
                   rootPrestartHostPreflight=dict(path=str(preflight_path), sha256=digest(preflight_path)),
                   runtimePreflight=runtime_before, subreaperOperations=subreaper_operations,
                   argv=offer['argv'], cwd=offer['cwd'], environment=offer['environment'],
                   sampledScope='single child-denied M0 Node subtree; outer/timeout/guard/prepost excluded',
                   nativeExecution=False, wholeIntervalRequiresExternalReadback=True)
    code = 70
    try:
        with paths[0].open('xb') as out, paths[1].open('xb') as err:
            LAUNCH_STARTED = True
            DIRECT = subprocess.Popen(offer['argv'], cwd=offer['cwd'], env=dict(offer['environment'], M0_OFFER_SHA=digest(HERE/'offer.dat')),
                                      stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True, umask=0o077)
            DIRECT_SIGNAL_ALLOWED = True; receipt['outerChildPid'] = DIRECT.pid
            own_all_children()
            out.flush(); err.flush(); os.fsync(out.fileno()); os.fsync(err.fileno())
        receipt['launchThroughCaptureCloseNs'] = time.monotonic_ns() - BEGAN
        require(FINAL_ECHILD and not HELD and not LATCHED, 'ending held')
        require(len(WAITS) == 1 and WAITS[0]['pid'] == DIRECT.pid, 'normal sole direct wait topology')
        waited = WAITS[0]; code = waited['terminal']; receipt['terminal'] = code
        members(offer); receipt['runtimePostflight'] = verify_runtime()
        receipt['captures'] = [dict(path=str(p), bytes=p.stat().st_size, sha256=digest(p)) for p in paths[:2]]
        require(all(p.stat().st_size <= 4*1024*1024 for p in paths[:2]), 'complete capture caps')
        require(code == 0 and os.WIFEXITED(waited['rawStatus']) and os.WEXITSTATUS(waited['rawStatus']) == 0 and
                waited['identity']['state'] == 'Z' and waited['identity']['cmdlineHex'] == '', 'normal exact raw terminal')
        require(paths[3].stat().st_size <= 65536, 'bounded complete guard log')
        guard_rows = [json.loads(line) for line in paths[3].read_text().splitlines()]
        require(len(guard_rows) == 2 and [r['event'] for r in guard_rows] == ['start','end'] and
                all(r['limitMB'] == 600 and r['heapMB'] == 64 for r in guard_rows) and
                all(isinstance(r['at'],str) and len(r['at']) == 24 for r in guard_rows) and
                all(r['name'] == offer['guardName'] and r['command'] == offer['normalizedLeaf'] for r in guard_rows) and
                guard_rows[0]['waitedSeconds'] == 0 and guard_rows[1]['code'] == 0 and guard_rows[1]['outcome'] == 'exit 0', 'normal guard joins')
        receipt['guardRows'] = [{k:r[k] for k in ('event','at','limitMB','heapMB')} for r in guard_rows]
        receipt['guardCapture'] = dict(path=str(paths[3]), bytes=paths[3].stat().st_size, sha256=digest(paths[3]))
        receipt['outputRetention'] = output_tree(offer)
        descendant = waited['rusage']['ru_maxrss'] * 1024
        require(descendant > 0, 'specific waited descendant maximum')
        # All source/runtime/output/capture parsing and streaming hashes precede O.
        own_usage = resource.getrusage(resource.RUSAGE_SELF); own = own_usage.ru_maxrss * 1024
        price = own + 4 * descendant + 8 * 1024 * 1024
        receipt['normalWholeActorPrice'] = dict(actorBound=5, launcherSelfRawKiB=own_usage.ru_maxrss,
            launcherSelfRawUsage={n:getattr(own_usage,n) for n in dir(own_usage) if n.startswith('ru_')},
            launcherSelfPeakBytes=own, outerWaitedPeakBytes=descendant, timeoutGuardControlQueryMultiplier=4,
            finalIoReserveBytes=8*1024*1024, conservativeBytes=price, limitBytes=600*1024*1024,
            formula='O + 4*T + 8MiB', basis='Five sealed normal roles; sole exact wait, actual ECHILD, no adoption or lost status; bounded final tail')
        require(price <= 600*1024*1024 and not LATCHED and time.monotonic_ns()-BEGAN < 118000000000, 'whole price/deadline held')
        receipt['state'] = 'M0_TERMINAL_PENDING_INDEPENDENT_REVIEW'
    except BaseException as error:
        hold(type(error).__name__ + ': ' + str(error)); code = 70
        print('HELD: ' + str(error), file=sys.stderr, flush=True)
    finally:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('EXCEPTIONAL_OWNERSHIP_DRAIN'); own_all_children()
        receipt.update(waits=WAITS, finalECHILD=FINAL_ECHILD, signals=sorted(LATCHED), held=HELD,
                       processExtinctionClaimed=False, resourceReleaseAccepted=False,
                       elapsedBeforeReceiptWriteNs=time.monotonic_ns()-BEGAN)
        if HELD or LATCHED:
            receipt['state'] = 'HELD_ACTUAL_WAITED_ENDING_PENDING_REVIEW'; code = 70
        receipt['terminalReturned'] = code
        final_blob = (json.dumps(receipt,separators=(',', ':'),allow_nan=False)+'\n').encode('utf8')
        require(len(final_blob) <= 65536, '64 KiB final outer cap')
        with paths[2].open('xb') as target:
            target.write(final_blob); target.flush(); os.fsync(target.fileno())
        after = time.monotonic_ns()-BEGAN
        if LATCHED or after >= 118000000000:
            hold('FINALISATION_DEADLINE_OR_INTERRUPTION'); code = 70
        print(json.dumps(dict(state='OUTER_RECEIPT_FSYNCED',terminal=code,
                              elapsedThroughReceiptFsyncNs=after,under120Seconds=after < 120000000000)),flush=True)
        if LATCHED or time.monotonic_ns()-BEGAN >= 118000000000: code = 70
        signal.setitimer(signal.ITIMER_REAL,0)
    return code if code >= 0 else 128-code


if __name__ == '__main__':
    try:
        result = main()
    except BaseException:
        if LAUNCH_STARTED and not FINAL_ECHILD:
            hold('TOPLEVEL_EXCEPTION_OWNERSHIP_DRAIN'); own_all_children()
        raise
    else:
        sys.exit(result)
