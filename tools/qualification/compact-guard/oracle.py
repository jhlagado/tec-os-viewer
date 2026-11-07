"""Artifact predicates only. No process inspection, execution or effects on import.

These predicates cannot authorize release. Root exit must still be observed
by the external caller. A marker alone never establishes a control's reading.
"""
import hashlib
import json
from pathlib import Path
import struct


D1_IDENTITY_FIELDS = ('pid', 'birthSec', 'birthUsec', 'ppid', 'pgid', 'sid', 'exe', 'exeSha256')


def d1_identity_key(value):
    if not isinstance(value, dict) or value.get('state') != 'present': return None
    if not all(type(value.get(k)) is int and value[k] >= 0 for k in D1_IDENTITY_FIELDS[:6]): return None
    if any(not 2 <= value[k] <= 2147483647 for k in ('pid', 'ppid', 'pgid', 'sid')) or value['birthUsec'] >= 1000000 or value['birthSec'] >= 2**64: return None
    exe, digest = value.get('exe'), value.get('exeSha256')
    if not isinstance(exe, str) or not exe.startswith('/') or not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest): return None
    return tuple(value[k] for k in D1_IDENTITY_FIELDS)


def d1_worker_binding(ready, lease, node_seal):
    """Bootstrap lineage survives exec; Python's old exe is NOT Node's exe."""
    if not all(isinstance(v, dict) for v in (ready, lease, node_seal)): return None
    boot, guard, anchor = ready.get('bootstrap'), lease.get('guard'), lease.get('anchor')
    if any(d1_identity_key(v) is None for v in (boot, guard, anchor)): return None
    if (not isinstance(lease.get('groupToken'), str) or len(lease['groupToken']) != 64 or
            ready.get('token') != lease['groupToken'] or boot['ppid'] != guard['pid'] or
            boot['pgid'] != anchor['pid'] or boot['sid'] != anchor['pid'] or
            boot['pid'] in (guard['pid'], anchor['pid']) or
            node_seal.get('path') != guard['exe'] or node_seal.get('sha256') != guard['exeSha256']): return None
    argv = lease.get('bootstrap', {}).get('argv') if isinstance(lease.get('bootstrap'), dict) else None
    if not isinstance(argv, list) or len(argv) < 3 or argv[2] != node_seal['path']: return None
    expected = {k: boot[k] for k in D1_IDENTITY_FIELDS[:6]}
    expected.update(state='present', exe=node_seal['path'], exeSha256=node_seal['sha256'])
    return expected if d1_identity_key(expected) is not None else None


def d1_ns(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 24 or any(c not in '0123456789' for c in value): return None
    return int(value)


def d1_observation_valid(expected, observation):
    key = d1_identity_key(expected)
    if key is None or not isinstance(observation, dict): return False
    before, after = observation.get('identityBefore'), observation.get('identityAfter')
    if d1_identity_key(before) != key or d1_identity_key(after) != key: return False
    if before.get('clockDomain') != 'darwin-mach-continuous-ns-node24.18' or after.get('clockDomain') != before['clockDomain']: return False
    times = [d1_ns(v) for v in (before.get('clockNs'), observation.get('readStartedNs'), observation.get('readEndedNs'), after.get('clockNs'))]
    if any(v is None for v in times) or times != sorted(times): return False
    return all(type(observation.get(k)) is int and 0 <= observation[k] < 2**64 for k in ('cpuUserNs', 'cpuSystemNs')) and observation.get('completionAbsent') is True


def d1_pair_valid(expected, observations):
    if not isinstance(observations, list) or len(observations) != 2 or not all(d1_observation_valid(expected, p) for p in observations): return False
    first, second = observations
    return (int(second['readStartedNs']) - int(first['readEndedNs']) >= 50_000_000 and
            second['cpuUserNs'] >= first['cpuUserNs'] and second['cpuSystemNs'] >= first['cpuSystemNs'] and
            second['cpuUserNs'] + second['cpuSystemNs'] > first['cpuUserNs'] + first['cpuSystemNs'])


def d1_different_birth_control(expected, observations):
    """Future allocated D1 calls the real comparator on a same-PID reuse input."""
    if not d1_pair_valid(expected, observations): return None
    changed = json.loads(json.dumps(observations))
    for side in ('identityBefore', 'identityAfter'): changed[1][side]['birthSec'] += 1
    return {'kind': 'SYNTHETIC_SAME_PID_DIFFERENT_BIRTH', 'observations': changed,
            'actualComparatorRejected': not d1_pair_valid(expected, changed)}


def assess(directory, case, variant, t0, stopped_ns, broker_status, unknown):
    root = Path(directory)
    def read(name):
        path = root / name
        if not path.exists() or path.stat().st_size > 262144: return None
        return json.loads(path.read_text())
    activation = read('activated.json')
    journal = root / 'broker-events.jsonl'; events = []; previous = '0' * 64; chain_ok = True
    if not journal.exists() or journal.stat().st_size > 16 * 1024 * 1024:
        chain_ok = False
    else:
        for seq, line in enumerate(journal.read_text().splitlines()):
            if seq >= 4096: chain_ok = False; break
            e = json.loads(line)
            if e.get('seq') != seq or e.get('previous') != previous: chain_ok = False; break
            previous = hashlib.sha256(json.dumps(e, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            events.append(e)
    hard = t0 + (5 if case.startswith('D') else 120) * 10**9
    checks = {'activated': bool(activation), 'activationBeforeHardDeadline': bool(activation and int(activation['monoNs']) < hard),
              'cleanupBeforeHardDeadline': stopped_ns <= hard, 'brokerExitZero': broker_status == 0,
              'noUnknownHistory': not unknown, 'journalChainVerified': chain_ok}
    if not activation:
        return {'classification': 'NOT_ACTIVATED_INCOMPLETE', 'checks': checks, 'release': False, 'stopSuccessorAllocations': True}
    if case == 'D1':
        p = read('blocked-observed.json')
        ready, lease, runtime = read('bootstrap-dual-ack-ready.json'), read('lease.json'), read('runtime-source-seal.json')
        expected = d1_worker_binding(ready, lease, runtime.get('node') if isinstance(runtime, dict) else None)
        checks['independentContinuedBlockedObservation'] = bool(isinstance(p, dict) and d1_pair_valid(expected, p.get('observations')))
        control = p.get('differentBirthControl') if isinstance(p, dict) else None
        negative = control.get('observations') if isinstance(control, dict) else None
        required = d1_different_birth_control(expected, p.get('observations')) if isinstance(p, dict) else None
        checks['differentBirthRejectedByActualComparator'] = bool(required is not None and control == required and not d1_pair_valid(expected, negative))
    elif case == 'D2':
        checks['activeHTTPResponseWithheld'] = activation.get('activeRequestAccepted') is True and activation.get('closeCalled') is True
        checks['closeCallbackDidNotRun'] = not (root / 'unexpected-close.json').exists()
    elif case == 'D3':
        before, after = read('d3-prerequisite.json'), read('d3-after-term-independent.json')
        checks['bothReadyBeforeTERM'] = bool(before and len(before['members']) == 2 and int(before['beforeTermNs']) < t0 + 3 * 10**9)
        checks['bothAliveAfterActualTERM'] = bool(after and len(after['members']) == 2 and all(after['actualHandlerRecords']) and t0 + 3 * 10**9 < int(after['observedNs']) < t0 + 4 * 10**9)
    elif case in ('D4', 'D7'):
        checks['parentGoneWhileRegisteredGrandchildLives'] = activation.get('parentGoneObserved') is True and bool(activation.get('live')) and activation.get('child', {}).get('originalParent') == activation.get('parent', {}).get('pid')
        if case == 'D7': checks['actualGuardTokenKilled'] = any(e.get('kind') == 'fault-kill-owned-token' and e.get('token') == read('lease.json')['groupToken'] for e in events)
    elif case == 'D5':
        if variant == 'bootstrap':
            p = activation.get('bootstrapIdentity', {})
            checks['actualBootstrapStopped'] = p.get('status') == 4 and p.get('ppid') == read('lease.json')['guard']['pid']
        else:
            rows = activation.get('kernelRows', [])
            checks['actualStoppedBoundary'] = activation.get('boundary') == variant and any(p.get('status') == 4 for p in rows)
    elif case == 'D6':
        checks['actualStandInConnectionStalled'] = activation.get('actualConnectionAccepted') is True and activation.get('browserCompatibility') is False
    elif case in ('D8', 'D12'):
        if case == 'D12' and variant == 'channel-loss':
            checks['actualWatchdogChannelClosed'] = activation.get('channelOpen') is False
        else:
            checks['ownedPeerIdentifiedForPhysicalKill'] = bool(activation.get('target', {}).get('birthUsec') is not None)
            target = activation.get('target', {})
            launches = read('launches.json') or []
            token = next((g['token'] for g in launches if g['pid'] == target.get('sid')), None)
            checks['actualPeerTokenKilled'] = bool(token and any(e.get('kind') == 'fault-kill-owned-token' and e.get('token') == token for e in events))
        peer_reports = [read('supervisor-stop.json'), read('watchdog-stop.json')]
        checks['independentPeerLossDetected'] = any(p and ('peer' in p['reason'] or 'inspection' in p['reason']) for p in peer_reports)
    elif case == 'D9':
        checks['actualInspectionRefused'] = activation.get('kind') == 'actual-inspection-' + variant and activation.get('refusalObserved') is True
        if variant == 'malformed': checks['malformedBytesPresent'] = activation.get('output') == 'NOT_JSON_INSPECTION\n'
        else:
            checks['actualIPCTimeout'] = activation.get('ipcTimeoutObserved') is True
            checks['expiredSignedLeaseRefusedWithoutSpawn'] = activation.get('expiredAdmissionRefused') is True and activation.get('noExpiredSpawn') is True
    elif case == 'D10':
        checks['intendedUnsafeTransitionWithheld'] = activation.get('result', {}).get('withheld') is True and (('birth mismatch' if variant == 'birth' else 'planned-group mismatch') in activation.get('result', {}).get('error', ''))
        checks['noGenerationAdvance'] = activation.get('before', {}).get('generation') == activation.get('after', {}).get('generation')
    elif case == 'D11':
        result = read('result.json')
        checks['actualNormalExitObserved'] = bool(result and result.get('classification') == 'NORMAL_EXIT_OBSERVED_CLEANUP_PENDING' and result.get('end', {}).get('code') == 0)
    elif case == 'B1':
        path = root / 'native.png'
        data = path.read_bytes() if path.exists() and path.stat().st_size <= 16 * 1024 * 1024 else b''
        checks['actualNativePNG'] = len(data) >= 24 and data.startswith(b'\x89PNG\r\n\x1a\n') and struct.unpack('>II', data[16:24]) == (600, 900) and hashlib.sha256(data).hexdigest() == activation.get('pngSha256')
        checks['actualServedBytes'] = activation.get('received', {}).get('sha256') == activation.get('expectedBodySha256') and bool(activation.get('received', {}).get('status') == 200)
        checks['actualBrowserCloseObserved'] = (root / 'browser-close-observed.json').exists()
    elif case == 'B2':
        checks['actualBrowserBeforeAttachmentStall'] = activation.get('kind') == 'actual-browser-attachment-upgrade-stalled' and (root / 'browser-seal.json').exists()
    good = all(checks.values())
    return {'classification': 'CONTROL_OBSERVATIONS_COMPLETE_PENDING_EXTERNAL_ROOT_EXIT' if good else 'CONTROL_INCOMPLETE_OR_FAILED',
            'checks': checks, 'release': False, 'stopSuccessorAllocations': not good}
