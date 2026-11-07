"""Separate source-only startup diagnostic. No owned-program imports or repair."""
# Keep this import sequence identical to the consumed owner, including aliases.
import ctypes as C
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import signal
import select
import resource
import struct
import sys

MAX_KEYS = 12
MAX_KEY_BYTES = 64
MAX_VALUE_BYTES = 4096
MAX_TOTAL_VALUE_BYTES = 16384
MAX_STDOUT_BYTES = 8192
MEMORY_BYTES = 700 * 1048576
BODY_NS = 2000000000


def snapshot():
    bytecode = sys.dont_write_bytecode
    safe_bytecode = type(bytecode) is bool or bytecode is None or (type(bytecode) is int and -2147483648 <= bytecode <= 2147483647)
    flags = {'isolated': int(sys.flags.isolated), 'noSite': int(sys.flags.no_site),
             'ignoreEnvironment': int(sys.flags.ignore_environment),
             'noUserSite': int(sys.flags.no_user_site),
             'dontWriteBytecode': bytecode if safe_bytecode else None,
             'dontWriteBytecodeValueAvailable': safe_bytecode}
    count = len(os.environ)
    components = {'isolatedTruthy': bool(sys.flags.isolated),
                  'noSiteTruthy': bool(sys.flags.no_site),
                  'dontWriteBytecodeTruthy': bool(bytecode) if safe_bytecode else None,
                  'postImportEnvironmentEmpty': count == 0}
    predicate = all(components.values()) if safe_bytecode else None
    if not safe_bytecode: return flags, count, components, predicate, (), 'FLAG_VALUE_TYPE'
    if count > MAX_KEYS: return flags, count, components, predicate, (), 'ENV_COUNT_BOUND'
    if not os.supports_bytes_environ: return flags, count, components, predicate, (), 'RAW_ENV_UNAVAILABLE'
    if len(os.environb) != count: return flags, count, components, predicate, (), 'ENV_VIEW_CHANGED'
    rows = []
    for key in os.environb:
        if not 1 <= len(key) <= MAX_KEY_BYTES: return flags, count, components, predicate, (), 'ENV_KEY_BOUND'
        if not (65 <= key[0] <= 90 or 97 <= key[0] <= 122 or key[0] == 95):
            return flags, count, components, predicate, (), 'ENV_KEY_ENCODING'
        if any(not (65 <= x <= 90 or 97 <= x <= 122 or 48 <= x <= 57 or x == 95) for x in key):
            return flags, count, components, predicate, (), 'ENV_KEY_ENCODING'
        # environb returns existing bytes. Inspect length before any decode/copy/hash.
        rows.append((key, os.environb[key]))
    return flags, count, components, predicate, tuple(sorted(rows)), None


def clock():
    lib = C.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    lib.mach_continuous_time.argtypes = []; lib.mach_continuous_time.restype = C.c_uint64
    lib.mach_timebase_info.argtypes = [C.c_void_p]; lib.mach_timebase_info.restype = C.c_int
    tb = (C.c_uint32 * 2)()
    if lib.mach_timebase_info(tb) or not tb[0] or not tb[1]: raise RuntimeError('CLOCK_UNAVAILABLE')
    return lambda: lib.mach_continuous_time() * tb[0] // tb[1]


def sample_memory(lib):
    values = (C.c_uint64 * 128)(); C.set_errno(0)
    returned = lib.proc_pid_rusage(os.getpid(), 4, values); native_errno = C.get_errno()
    if returned or native_errno or values[30] < values[9]: raise RuntimeError('SELF_MEMORY_UNAVAILABLE')
    rss_peak = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if rss_peak <= 0: raise RuntimeError('SELF_RSS_HIGHWATER_UNAVAILABLE')
    observed = max(rss_peak, int(values[8]), int(values[9]), int(values[30]))
    return {'rssHighwaterBytes': rss_peak, 'residentBytes': int(values[8]),
            'physicalFootprintBytes': int(values[9]),
            'lifetimePhysicalFootprintBytes': int(values[30]), 'boundValueBytes': observed}


def emit(result, code, now, deadline):
    raw = json.dumps(result, sort_keys=True, separators=(',', ':')).encode('utf-8') + b'\n'
    if len(raw) > MAX_STDOUT_BYTES:
        raw = b'{"kind":"STARTUP_DIAGNOSTIC","captureComplete":false,"errorCode":"STDOUT_BOUND"}\n'
        code = 70
    if now is not None and now() >= deadline: code = 70
    try:
        out = os.fstat(1)
        if not (stat.S_ISREG(out.st_mode) or stat.S_ISFIFO(out.st_mode)): return 74
        os.set_blocking(1, False)  # Allocation requires a PRIVATE capture description.
        if os.write(1, raw) != len(raw): return 74
    except OSError: return 74
    if now is not None and now() >= deadline: return 70
    return code


def main():
    report = {'kind': 'STARTUP_DIAGNOSTIC', 'captureComplete': False,
              'expectedInitialEnvironment': 'EMPTY_BY_LAUNCH_CONTRACT',
              'initialEnvironmentObservedByDiagnostic': False,
              'environmentOrigin': 'NOT_INFERRED', 'environment': [], 'memorySamples': []}
    now = None; deadline = 0; code = 70
    try:
        # Observe flags/env AFTER the exact imports, BEFORE clock/memory binding.
        flags, count, components, predicate, rows, error = snapshot()
        report.update(flags=flags, postImportEnvironmentCount=count,
                      consumedPredicateComponents=components, consumedCombinedPredicateWouldPass=predicate)
        now = clock(); start = now(); deadline = start + BODY_NS
        report.update(bodyStartNs=str(start), bodyDeadlineNs=str(deadline),
                      clockDomain='darwin-mach-continuous-ns-node24.18', bootstrapTimeMeasured=False)
        lib = C.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        lib.proc_pid_rusage.argtypes = [C.c_int, C.c_int, C.c_void_p]; lib.proc_pid_rusage.restype = C.c_int
        total = 0
        sample = sample_memory(lib); report['memorySamples'].append(sample)
        if sample['boundValueBytes'] > MEMORY_BYTES: raise RuntimeError('SELF_MEMORY_LIMIT')
        if len(sys.argv) != 1: error = error or 'ARGV_PROFILE'
        if error: raise RuntimeError(error)
        for key, value in rows:
            if now() >= deadline: raise RuntimeError('BODY_DEADLINE')
            if len(value) > MAX_VALUE_BYTES or total + len(value) > MAX_TOTAL_VALUE_BYTES:
                raise RuntimeError('ENV_VALUE_BOUND')
            # Strict UTF-8 validation only. No decoded value is retained or emitted.
            value.decode('utf-8', errors='strict')
            total += len(value)
            report['environment'].append({'key': key.decode('ascii'),
                'valueUtf8Bytes': len(value), 'valueSha256': hashlib.sha256(value).hexdigest()})
        sample = sample_memory(lib); report['memorySamples'].append(sample)
        if sample['boundValueBytes'] > MEMORY_BYTES: raise RuntimeError('SELF_MEMORY_LIMIT')
        if now() >= deadline: raise RuntimeError('BODY_DEADLINE')
        report.update(captureComplete=True, processedValueBytes=total, capturedAtNs=str(now()))
        code = 0
    except BaseException as error:
        # Never emit exception text/args: encoding errors can contain plaintext.
        allowed = {'CLOCK_UNAVAILABLE', 'SELF_MEMORY_UNAVAILABLE', 'SELF_RSS_HIGHWATER_UNAVAILABLE',
                   'SELF_MEMORY_LIMIT', 'FLAG_VALUE_TYPE', 'ENV_COUNT_BOUND', 'RAW_ENV_UNAVAILABLE', 'ENV_VIEW_CHANGED',
                   'ENV_KEY_BOUND', 'ENV_KEY_ENCODING', 'ARGV_PROFILE', 'BODY_DEADLINE', 'ENV_VALUE_BOUND'}
        token = error.args[0] if type(error) is RuntimeError and len(error.args) == 1 else None
        report['errorCode'] = token if isinstance(token, str) and token in allowed else 'INCOMPLETE_CAPTURE'
        kind = type(error).__name__
        safe_types = {'RuntimeError', 'UnicodeDecodeError', 'UnicodeEncodeError', 'OSError', 'MemoryError',
                      'ValueError', 'TypeError', 'AttributeError', 'KeyError', 'KeyboardInterrupt', 'SystemExit'}
        report['errorType'] = kind if kind in safe_types else 'OTHER'
    return emit(report, code, now, deadline)


if __name__ == '__main__':
    try: status = main()
    except BaseException: status = 70
    os._exit(status)  # No extra result, traceback or Python finaliser output.
