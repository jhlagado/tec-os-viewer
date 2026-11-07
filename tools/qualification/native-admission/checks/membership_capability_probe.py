"""Unallocated read-only membership capability candidate; no work on import.

Only self + one supplied inert PID, no enumeration/protected detail, process
creation, signals, resource changes, network or classifier implementation.
The external coordinator owns allocation, startup, limits and exact exit.
"""
import ctypes as C
import hashlib
import json
import os
import stat
import sys


INTERPRETER = '/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python'
INTERPRETER_SHA = '0b7aad9bf1adf74d3922cf351f7d2e908dae19edd5456299d162810ae083523d'
FRAMEWORK = '/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Python3'
FRAMEWORK_SHA = '26422f0b21cb1e07236384afa4043c7401d39d09358c91df8bf3f5496f14712f'
DOMAIN = 'darwin-mach-continuous-ns-node24.18'


def read_regular(path, limit, private=False):
    if not os.path.isabs(path): raise ValueError('absolute input required')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_size > limit or
                (private and (before.st_uid != os.getuid() or before.st_mode & 0o077))):
            raise ValueError('file type/size/permission')
        data = os.read(fd, limit + 1)
        after = os.fstat(fd)
        if (len(data) != before.st_size or len(data) > limit or
                (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) !=
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)):
            raise ValueError('file changed/partial/oversized')
        return data
    finally: os.close(fd)


def file_digest(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum: raise ValueError('binary seal bound')
        h = hashlib.sha256(); total = 0
        while True:
            data = os.read(fd, 65536)
            if not data: break
            total += len(data)
            if total > maximum: raise ValueError('binary grew')
            h.update(data)
        after = os.fstat(fd)
        if total != before.st_size or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns): raise ValueError('binary changed')
        return h.hexdigest()
    finally: os.close(fd)


def emit(result, code):
    raw = json.dumps(result, sort_keys=True, separators=(',', ':')).encode() + b'\n'
    if len(raw) > 16384:
        raw = b'{"kind":"MEMBERSHIP_CAPABILITY","outcome":"UNKNOWN","error":"output bound"}\n'
        code = 70
    os.set_blocking(1, False)
    try:
        if os.write(1, raw) != len(raw): return 74
    except OSError: return 74
    return code


def main(argv):
    result = {'kind': 'MEMBERSHIP_CAPABILITY', 'outcome': 'UNKNOWN', 'clockDomain': DOMAIN,
              'cohortQualified': False, 'pidIdentityQualified': False, 'detailCalls': 0,
              'enumerationCalls': 0, 'membershipReads': []}
    try:
        if len(argv) != 3 or argv[1] != '--input': raise ValueError('exact --input file required')
        if not (sys.flags.isolated and sys.flags.no_site and sys.flags.ignore_environment and sys.flags.no_user_site and sys.dont_write_bytecode):
            raise ValueError('requires isolated -I -S -B before startup')
        allowed_env = {'HOME', 'TMPDIR', 'PATH', 'LANG', 'LC_ALL', 'TZ'}
        if set(os.environ) - allowed_env: raise ValueError('unreviewed inherited environment')
        if any(os.environ.get(k) != v for k, v in {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C', 'TZ': 'UTC'}.items()): raise ValueError('environment profile mismatch')
        data = json.loads(read_regular(argv[2], 4096, private=True))
        required = {'version', 'allocation', 'owner', 'coordinatorPid', 't0Ns', 'deadlineNs', 'probeSha256'}
        if (not isinstance(data, dict) or set(data) != required or data['version'] != 1 or
                data['allocation'] != 'EXPLICITLY_ALLOCATED_READONLY_MEMBERSHIP_PROBE' or
                not isinstance(data['owner'], str) or not 1 <= len(data['owner']) <= 128): raise ValueError('input schema/allocation label')
        if not isinstance(data['probeSha256'], str) or len(data['probeSha256']) != 64 or hashlib.sha256(read_regular(os.path.abspath(__file__), 65536)).hexdigest() != data['probeSha256']:
            raise ValueError('source seal mismatch')
        own = os.getpid(); other = data['coordinatorPid']
        if type(other) is not int or not 2 <= other <= 2147483647 or other == own: raise ValueError('one distinct inert coordinator PID required')
        for key in ('t0Ns', 'deadlineNs'):
            if not isinstance(data[key], str) or not 1 <= len(data[key]) <= 24 or any(c not in '0123456789' for c in data[key]): raise ValueError('clock input')
        t0, deadline = int(data['t0Ns']), int(data['deadlineNs'])
        if not 0 < deadline - t0 <= 150000000: raise ValueError('native acceptance window must be at most150ms')
        lib = C.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
        class Timebase(C.Structure):
            _fields_ = [('numer', C.c_uint32), ('denom', C.c_uint32)]
        lib.mach_timebase_info.argtypes = [C.POINTER(Timebase)]; lib.mach_timebase_info.restype = C.c_int
        lib.mach_continuous_time.argtypes = []; lib.mach_continuous_time.restype = C.c_uint64
        tb = Timebase()
        if lib.mach_timebase_info(C.byref(tb)) or not tb.denom: raise RuntimeError('clock unavailable')
        def now(): return lib.mach_continuous_time() * tb.numer // tb.denom
        def check():
            current = now()
            if current < t0 or current >= deadline: raise TimeoutError('original acceptance deadline')
            return current
        check()
        lib._NSGetExecutablePath.argtypes = [C.c_void_p, C.POINTER(C.c_uint32)]; lib._NSGetExecutablePath.restype = C.c_int
        path = C.create_string_buffer(4096); size = C.c_uint32(len(path))
        if lib._NSGetExecutablePath(path, C.byref(size)) or os.path.realpath(os.fsdecode(path.value)) != INTERPRETER:
            raise RuntimeError('actual loaded executable path differs')
        if file_digest(INTERPRETER, 1048576) != INTERPRETER_SHA or file_digest(FRAMEWORK, 8388608) != FRAMEWORK_SHA:
            raise RuntimeError('interpreter/framework bytes differ')
        check()
        result.update(owner=data['owner'], selfPid=own, coordinatorPid=other, t0Ns=str(t0), deadlineNs=str(deadline),
                      interpreterPath=INTERPRETER, interpreterSha256=INTERPRETER_SHA, frameworkSha256=FRAMEWORK_SHA,
                      pythonVersion=list(sys.version_info[:3]), startupFlags={'isolated': sys.flags.isolated, 'noSite': sys.flags.no_site, 'ignoreEnvironment': sys.flags.ignore_environment, 'noUserSite': sys.flags.no_user_site, 'noBytecodeWrites': sys.dont_write_bytecode})
        for role, pid in (('self', own), ('explicit-coordinator-pid-not-identity', other)):
            for operation in ('getsid', 'getpgid'):
                fn = getattr(lib, operation); fn.argtypes = [C.c_int]; fn.restype = C.c_int
                started = check(); C.set_errno(0)
                returned = fn(pid); native_errno = C.get_errno()
                ended = now()
                result['membershipReads'].append({'role': role, 'pid': pid, 'operation': operation,
                    'rawReturn': returned, 'errno': native_errno, 'startNs': str(started), 'endNs': str(ended)})
                if returned <= 0 or native_errno or ended >= deadline: raise RuntimeError('membership denied/invalid/late; no outside inference')
        result.update(outcome='OBSERVED_ONLY_FOR_REQUESTED_PIDS', completedAtNs=str(check()))
        return emit(result, 0)
    except Exception as error:
        result.update(errorType=type(error).__name__, error=str(error)[:512])
        return emit(result, 70)


if __name__ == '__main__': raise SystemExit(main(sys.argv))
