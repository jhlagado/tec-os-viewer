"""Unreviewed standalone pinned owner command for ONE allocated B or R phase.

Owns real caller/release handles and actual waits. No callback injection or
persistent root host is assumed. Root's terminal observation is external.
Source preparation only: never imported or executed during preparation.
"""
import ctypes as C
import errno
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

STARTUP_PROFILE = (
    (b'LC_CTYPE', 7, '99fed2d548c2eb1022f4067f97fe838a2c3ea60ee0e0f53086788505c3ababad'),
    (b'__CF_USER_TEXT_ENCODING', 10, 'e52237f479d2cd94721174896f277346c9e3191b21edfbd3bf2f35f71db48e60'),
)

BASE = Path('/tmp/p6-membership-vd14-01')
LOCK = Path('/Users/johnhardy/.origo/heavy.lock')


SOURCE=Path(__file__).resolve().parent
PYROOT=Path('/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9')
INTERPRETER=PYROOT/'Resources/Python.app/Contents/MacOS/Python'
CALLER=SOURCE/'native-membership-caller.py'
_OWNER_GROUP=None
_GROUP_PROC=None


def _owner_row(pid):
    global _GROUP_PROC
    if _GROUP_PROC is None:
        _GROUP_PROC=C.CDLL('/usr/lib/libproc.dylib',use_errno=True)
        _GROUP_PROC.proc_pidinfo.argtypes=[C.c_int,C.c_int,C.c_uint64,C.c_void_p,C.c_int]
        _GROUP_PROC.proc_pidinfo.restype=C.c_int
        _GROUP_PROC.proc_listpgrppids.argtypes=[C.c_int,C.c_void_p,C.c_int]
        _GROUP_PROC.proc_listpgrppids.restype=C.c_int
    def read():
        buf=C.create_string_buffer(136); C.set_errno(0)
        n=_GROUP_PROC.proc_pidinfo(pid,3,1,buf,136); error=C.get_errno()
        status=struct.unpack_from('<I',buf.raw,4)[0]
        pid_read,ppid,uid=struct.unpack_from('<III',buf.raw,12)
        if n!=136 or error or pid_read!=pid or status==5:
            raise RuntimeError('owner group BSD pid=%d return=%d errno=%d payloadPid=%d status=%d'%(pid,n,error,pid_read,status))
        sec,usec=struct.unpack_from('<QQ',buf.raw,120)
        if not 2<=pid<=2147483647 or not 0<=usec<1000000:
            raise RuntimeError('owner group birth range')
        return {'pid':pid,'ppid':ppid,'uid':uid,'pgid':struct.unpack_from('<I',buf.raw,100)[0],
                'sec':sec,'usec':usec}
    before=read(); sid=os.getsid(pid); pgid=os.getpgid(pid)
    if before!=read() or pgid!=before['pgid'] or sid<2:
        raise RuntimeError('owner group native bracket changed')
    before['sid']=sid
    return before


def _owner_members(pid):
    values=(C.c_int*128)(); C.set_errno(0)
    count=_GROUP_PROC.proc_listpgrppids(pid,values,C.sizeof(values)); error=C.get_errno()
    if error or not 0<count<128:
        raise RuntimeError('owner group pid=%d count=%d errno=%d capacity=128'%(pid,count,error))
    members=[int(values[i]) for i in range(count)]
    if len(set(members))!=count or any(p<2 for p in members):
        raise RuntimeError('owner group invalid PID list')
    return set(members)


def _owner_continuity():
    if _OWNER_GROUP is None: return
    if _owner_row(os.getpid())!=_OWNER_GROUP['singletonMembers'][0]:
        raise RuntimeError('original owner birth/UID/SID/PGID changed')


def _owner_singleton(now, deadline=None):
    _owner_continuity(); pid=os.getpid()
    if (deadline is not None and now()>=deadline) or _owner_members(pid)!={pid}:
        raise RuntimeError('pre-caller owner group not singleton')
    _owner_continuity()
    if _owner_members(pid)!={pid} or (deadline is not None and now()>=deadline):
        raise RuntimeError('pre-caller singleton changed/late')


def _establish_owner_group(now, deadline):
    global _OWNER_GROUP
    pid=os.getpid(); row=_owner_row(pid)
    if (row['sid'],row['pgid'])!=(pid,pid):
        if row['pgid']==pid: raise RuntimeError('group leader cannot establish private session')
        os.setsid()  # One eligible in-place establishment, never a replacement owner.
    row=_owner_row(pid)
    if row['sid']!=pid or row['pgid']!=pid or row['uid']!=os.getuid():
        raise RuntimeError('private owner SID/PGID/UID unavailable')
    _OWNER_GROUP={'version':1,'ownerIdentity':{k:row[k] for k in ('pid','sec','usec')},
        'uid':row['uid'],'sid':pid,'pgid':pid,'singletonMembers':[row],
        'singletonObservedNs':str(now()),'premise':'COMPLETE_BOUNDED_GROUP_NOT_CONSUMER_TABLE'}
    if len((json.dumps(_OWNER_GROUP,sort_keys=True)+'\n').encode())>2048:
        raise RuntimeError('owner proof byte bound')
    _owner_singleton(now,deadline)
    _OWNER_GROUP['singletonObservedNs']=str(now())
    if now()>=deadline: raise RuntimeError('owner establishment original deadline')


def _proof_shape(proof):
    if (not isinstance(proof,dict) or set(proof)!={'version','ownerIdentity','uid','sid','pgid','singletonMembers','singletonObservedNs','premise'} or
        len((json.dumps(proof,sort_keys=True)+'\n').encode())>2048): raise RuntimeError('owner proof schema/bound')
    rows=proof['singletonMembers']; stamp=proof['singletonObservedNs']; birth=proof['ownerIdentity']
    if (type(proof['version']) is not int or proof['version']!=1 or
        not isinstance(rows,list) or len(rows)!=1 or not isinstance(rows[0],dict) or
        set(rows[0])!={'pid','ppid','uid','pgid','sid','sec','usec'} or
        any(type(v) is not int for v in rows[0].values()) or
        not isinstance(birth,dict) or set(birth)!={'pid','sec','usec'} or any(type(v) is not int for v in birth.values()) or
        not isinstance(stamp,str) or not stamp.isascii() or not stamp.isdecimal() or not 1<=len(stamp)<=24 or
        proof['premise']!='COMPLETE_BOUNDED_GROUP_NOT_CONSUMER_TABLE'): raise RuntimeError('owner proof shape')
    row=rows[0]
    if (not 2<=row['pid']<=2147483647 or not 1<=row['ppid']<=2147483647 or
        not 0<=row['uid']<2**32 or not 0<=row['sec']<2**64 or not 0<=row['usec']<1000000 or
        birth!={k:row[k] for k in ('pid','sec','usec')} or
        any(type(proof[k]) is not int or proof[k]!=row[k] for k in ('uid','sid','pgid')) or
        row['sid']!=row['pid'] or row['pgid']!=row['pid']): raise RuntimeError('owner proof invariant')


def _pair_shape(pair, proof, child):
    _proof_shape(proof)
    if (not isinstance(child,dict) or set(child)!={'pid','sec','usec'} or
        any(type(v) is not int for v in child.values())): raise RuntimeError('pair child schema')
    if not isinstance(pair,dict) or set(pair)!={'observedNs','members'}: raise RuntimeError('pair schema')
    rows=pair['members']; stamp=pair['observedNs']; pid=proof['ownerIdentity']['pid']
    if (not isinstance(stamp,str) or not stamp.isascii() or not stamp.isdecimal() or not 1<=len(stamp)<=24 or
        not isinstance(rows,list) or len(rows)!=2 or any(not isinstance(r,dict) or
        set(r)!={'pid','ppid','uid','pgid','sid','sec','usec'} or any(type(v) is not int for v in r.values()) for r in rows)):
        raise RuntimeError('pair shape')
    if ({r['pid'] for r in rows}!={pid,child['pid']} or child['pid']==pid or
        any(r['uid']!=proof['uid'] or r['sid']!=pid or r['pgid']!=pid for r in rows) or
        next(r for r in rows if r['pid']==pid)!=proof['singletonMembers'][0]): raise RuntimeError('pair joins')
    row=next(r for r in rows if r['pid']==child['pid'])
    if row['ppid']!=pid or {k:row[k] for k in ('pid','sec','usec')}!=child:
        raise RuntimeError('pair direct child incarnation')
    if (any(type(v) is not int for v in child.values()) or not 2<=child['pid']<=2147483647 or
        not 0<=child['sec']<2**64 or not 0<=child['usec']<1000000 or
        int(stamp)<int(proof['singletonObservedNs'])): raise RuntimeError('pair birth/time range')


def _clock():
    lib=C.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
    lib.mach_continuous_time.argtypes=[]; lib.mach_continuous_time.restype=C.c_uint64
    lib.mach_timebase_info.argtypes=[C.c_void_p]; lib.mach_timebase_info.restype=C.c_int
    tb=(C.c_uint32*2)()
    if lib.mach_timebase_info(tb) or not tb[1]: raise RuntimeError('host clock')
    return lambda:lib.mach_continuous_time()*tb[0]//tb[1]


def _birth(pid):
    lib=C.CDLL('/usr/lib/libproc.dylib',use_errno=True)
    lib.proc_pidinfo.argtypes=[C.c_int,C.c_int,C.c_uint64,C.c_void_p,C.c_int]
    lib.proc_pidinfo.restype=C.c_int
    buf=C.create_string_buffer(136); C.set_errno(0)
    n=lib.proc_pidinfo(pid,3,0,buf,136); error=C.get_errno()
    if n!=136 or error or struct.unpack_from('<I',buf.raw,12)[0]!=pid:
        raise RuntimeError('host precise identity unavailable')
    return {'pid':pid,'sec':struct.unpack_from('<Q',buf.raw,120)[0],
            'usec':struct.unpack_from('<Q',buf.raw,128)[0]}


def _hash(path, maximum):
    fd=os.open(str(path),os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or not 0<=before.st_size<=maximum: raise RuntimeError('host hash file bound')
        h=hashlib.sha256(); total=0
        while True:
            _owner_memory_checkpoint()
            raw=os.read(fd,65536)
            _owner_memory_checkpoint()
            if not raw: break
            total+=len(raw)
            if total>maximum: raise RuntimeError('host hash grew')
            h.update(raw)
        after=os.fstat(fd)
        if total!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            raise RuntimeError('host hash changed')
        return h.hexdigest()
    finally: os.close(fd)


def launch_managed_phase(phase, allocation):
    """Called in the SAME live P3 host for B, R and both release preparations.

    Sets real legacy reservation owner to this host. It stays alive through all
    actual waits/finalization, so old observers cannot make the lock reclaimable.
    No new host process/controller is created by this function.
    """
    if phase not in ('build','run','release') or allocation.get('phase')!=phase:
        raise RuntimeError('fixed allocated phase')
    global _HOST_MANAGED,_OWNER_ACTIVE
    now=_clock(); t0=(_ENTRY_SETUP_NS if phase!='release' and _ENTRY_SETUP_NS is not None else now()); copied=dict(allocation)
    copied['allocationT0Ns']=str(t0); copied['trustedHostIdentity']=_birth(os.getpid())
    _owner_singleton(now,t0+(2_000_000_000 if phase=='release' else 60_000_000_000))
    copied['ownerGroupProof']=_OWNER_GROUP
    # Check the entire actual Python provider tree BEFORE executing the caller.
    manifest=SOURCE/'native-provider-files.sha256'
    if _hash(manifest,1048576)!=copied['providerManifestSha256']: raise RuntimeError('host provider manifest pin')
    provider={}
    for line in manifest.read_text().splitlines():
        expected,name=line.split('  ',1)
        if name.startswith(str(PYROOT)+'/'): provider[name]=expected
    if not 0<len(provider)<=2048: raise RuntimeError('host framework file count')
    total=0
    for name,expected in provider.items():
        total+=Path(name).stat().st_size
        if total>64*1048576 or _hash(Path(name),8*1048576)!=expected: raise RuntimeError('pre-start Python provider changed')
    for name in (str(CALLER),str(SOURCE/'native-membership-host-finalize.py')):
        if _hash(Path(name),65536)!=copied['reviewedInputs'].get(name): raise RuntimeError('host source pin')
    limit=2_000_000_000 if phase=='release' else 60_000_000_000
    if now()>=t0+limit: raise RuntimeError('pre-start setup original deadline')
    permits=Path('/tmp/p6-membership-vd14-01-permits')
    if phase=='build': permits.mkdir(mode=0o700)
    info=permits.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077: raise RuntimeError('private permit directory')
    tag=phase+('-'+copied['completedPhase'] if phase=='release' else '')
    permit_path=permits/(tag+'.json')
    raw=(json.dumps(copied,sort_keys=True)+'\n').encode()
    if len(raw)>16384: raise RuntimeError('host permit byte bound')
    fd=os.open(str(permit_path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        if os.write(fd,raw)!=len(raw): raise RuntimeError('host permit partial')
        os.fsync(fd)
    finally: os.close(fd)
    signal.signal(signal.SIGCHLD,signal.SIG_DFL)  # Before creation: no auto-reap/PID reuse gap.
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE,(1048576,1048576))
        resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    logs=[]; managed=None
    try:
        for suffix in ('stdout','stderr'):
            logs.append(os.open(str(permits/(tag+'-'+suffix)),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600))
        _owner_singleton(now,t0+limit)
        _HOST_MANAGED=True
        managed=subprocess.Popen([str(INTERPRETER),'-I','-S','-B',str(CALLER),phase,str(permit_path)],
            env={},cwd=str(SOURCE),stdin=subprocess.DEVNULL,stdout=logs[0],stderr=logs[1],
            close_fds=True,preexec_fn=limits)
        _OWNER_ACTIVE=managed
        _owner_memory_checkpoint()
        return managed,copied
    except BaseException:
        if managed is not None:
            # No post-spawn exception can discard the real retained handle.
            while True: select.select([],[],[],1)
        raise
    finally:
        for fd in logs:
            try: os.close(fd)
            except OSError: pass


def observe_managed_phase(managed, phase, allocation):
    """Real host wait for B/R; late exit is recorded as failed, never requested-exit proof."""
    if not isinstance(managed,subprocess.Popen) or managed.returncode is not None:
        raise RuntimeError('unreaped actual managed handle required')
    global _OWNER_ACTIVE
    now=_clock(); deadline=int(allocation['allocationT0Ns'])+60_000_000_000; late=False
    for _ in range(12000):
        _owner_memory_checkpoint()
        trial=BASE/'trial-invocation.json'
        if phase=='run' and trial.exists(): deadline=int(json.loads(_read(trial,4096))['operatorDeadlineNs'])
        if now()>=deadline: late=True; break
        waited,status=os.waitpid(managed.pid,os.WNOHANG)
        if waited==managed.pid:
            _OWNER_ACTIVE=None
            break
        select.select([],[],[],.005)
    else: late=True
    if late:
        # Keep this real global lock owner alive through OS stalls and UNKNOWN.
        while True:
            waited,status=os.waitpid(managed.pid,os.WNOHANG)
            if waited==managed.pid:
                _OWNER_ACTIVE=None
                break
            select.select([],[],[],1)
    managed.returncode=os.waitstatus_to_exitcode(status); at=now()
    suffix='-finished.json' if managed.returncode==0 else '-failed-retired.json'
    finish_raw=_read(BASE/(phase+suffix),16384); record=json.loads(finish_raw)
    if record['ownerIdentity']['pid']!=managed.pid: raise RuntimeError('actual phase wait/identity mismatch')
    if record.get('ownerGroupProof')!=_OWNER_GROUP: raise RuntimeError('phase owner proof mismatch')
    _owner_singleton(now)  # Late retired work remains failed; no new qualifying time window.
    group_at=now()
    if phase=='run' and managed.returncode==0: deadline=int(record['operatorDeadlineNs'])
    is_late=late or at>=deadline or group_at>=deadline
    classification=('QUALIFIED_BUILD' if phase=='build' else 'OBSERVED_ONLY_FOR_REQUESTED_PIDS')
    if managed.returncode!=0 or is_late: classification='FAILED_QUALIFICATION_COHORT_RETIRED'
    observed={'ownerIdentity':record['ownerIdentity'],'hostWaitReturncode':managed.returncode,
            'hostObservedCallerExit':True,'hostExitObservedNs':str(at),'hostExitLate':is_late,
            'classification':classification,'managedFinishSha256':hashlib.sha256(finish_raw).hexdigest(),
            'retirementReceipts':record['retirementReceipts'],'commandInventory':record['commandInventory'],
            'ownerGroupProof':_OWNER_GROUP,'ownerGroupCompletedNs':str(group_at)}
    data=(json.dumps(observed,sort_keys=True)+'\n').encode()
    if len(data)>16384: raise RuntimeError('host observation bound')
    fd=os.open(str(BASE/(phase+'-host-observed.json')),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        if os.write(fd,data)!=len(data): raise RuntimeError('host observation partial')
        os.fsync(fd)
    finally: os.close(fd)
    observed['hostObservedSha256']=hashlib.sha256(data).hexdigest()
    return observed


def _read(path, maximum):
    _owner_memory_checkpoint()
    fd=os.open(str(path),os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_mode&0o077 or not 0<=before.st_size<=maximum:
            raise RuntimeError('private bounded finalizer input')
        raw=os.read(fd,maximum+1); _owner_memory_checkpoint(); after=os.fstat(fd)
        if len(raw)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            raise RuntimeError('finalizer input changed')
        return raw
    finally: os.close(fd)


def finalize_after_actual_wait(managed_release, completed_phase, prepared_sha256, allocation):
    """Invoke INSIDE P3's existing trusted host, not as another observed job.

    managed_release is its retained, direct Popen child created with the packet's
    exact argv/env/FDs. P3 checks the callback's source hash BEFORE using it.
    allocation is the exact previously reviewed release allocation, retained in
    host memory. No user-controlled code or dynamic target selector is loaded.
    """
    global _OWNER_ACTIVE
    if not isinstance(managed_release,subprocess.Popen) or completed_phase not in ('build','run'):
        raise RuntimeError('real retained release-preparer handle required')
    # clock setup belongs to trusted host preparation, not another target process.
    lib=C.CDLL('/usr/lib/libSystem.B.dylib',use_errno=True)
    lib.mach_continuous_time.argtypes=[]; lib.mach_continuous_time.restype=C.c_uint64
    lib.mach_timebase_info.argtypes=[C.c_void_p]; lib.mach_timebase_info.restype=C.c_int
    tb=(C.c_uint32*2)()
    if lib.mach_timebase_info(tb) or not tb[1]: raise RuntimeError('host clock unavailable')
    def now(): return lib.mach_continuous_time()*tb[0]//tb[1]
    path=BASE/(completed_phase+'-release-prepared.json')
    initial_deadline=int(allocation['allocationT0Ns'])+2_000_000_000
    for _ in range(400):
        if path.exists(): break
        if now()>=initial_deadline: raise RuntimeError('release preparation deadline; keep canonical lock')
        select.select([],[],[],.005)
    else: raise RuntimeError('release preparation poll bound')
    raw=_read(path,16384)
    if hashlib.sha256(raw).hexdigest()!=prepared_sha256: raise RuntimeError('prepared receipt pin')
    prepared=json.loads(raw)
    if prepared['releaseIdentity']['pid']!=managed_release.pid or prepared['oldOwnerIdentity']!=allocation['ownerIdentity']:
        raise RuntimeError('actual handle/incarnation binding')
    if prepared.get('reservationHostIdentity')!=_birth(os.getpid()):
        raise RuntimeError('actual still-live global reservation owner differs')
    if prepared.get('ownerGroupProof')!=_OWNER_GROUP:
        raise RuntimeError('release owner group proof mismatch')
    if prepared.get('hostObservedSha256')!=allocation.get('hostObservedSha256'):
        raise RuntimeError('release original host observation mismatch')
    _pair_shape(prepared.get('releaseGroupProof'),_OWNER_GROUP,prepared['releaseIdentity'])
    _owner_continuity()
    if managed_release.returncode is not None: raise RuntimeError('release handle already consumed')
    expected_prefix=[str(INTERPRETER),'-I','-S','-B',str(CALLER),'release']
    if list(managed_release.args)[:6]!=expected_prefix: raise RuntimeError('release role argv differs')
    deadline=int(prepared['operatorDeadlineNs'])
    status=None
    for _ in range(400):
        _owner_memory_checkpoint()
        if now()>=deadline: raise RuntimeError('original release deadline; hold gate')
        # Raw actual wait: unlike Popen.wait, ECHILD cannot be converted to exit0.
        waited,status=os.waitpid(managed_release.pid,os.WNOHANG)
        if waited==managed_release.pid:
            _OWNER_ACTIVE=None
            break
        select.select([],[],[],.005)
    else: raise RuntimeError('release wait bound; hold gate')
    code=os.waitstatus_to_exitcode(status); managed_release.returncode=code
    actual_exit_observed=now()
    if code!=0 or actual_exit_observed>=deadline: raise RuntimeError('actual release exit failed/late; hold gate')
    # Do not accept a different prepared receipt after the actual wait.
    if _read(path,16384)!=raw: raise RuntimeError('prepared receipt changed across wait')
    _owner_singleton(now,deadline)
    gate=Path(str(LOCK)+'.clearing'); directory=gate.lstat()
    if not stat.S_ISDIR(directory.st_mode) or (directory.st_dev,directory.st_ino)!=(prepared['gateDev'],prepared['gateIno']):
        raise RuntimeError('published nonempty gate identity changed')
    gate_owner=json.loads(_read(gate/'owner.json',4096))
    if gate_owner['releaseIdentity']!=prepared['releaseIdentity'] or gate_owner['oldOwnerIdentity']!=prepared['oldOwnerIdentity']:
        raise RuntimeError('nonempty gate authority mismatch')
    if gate_owner.get('ownerGroupProof')!=_OWNER_GROUP: raise RuntimeError('gate owner proof mismatch')
    lockraw=_read(LOCK,4096); lockstat=LOCK.lstat()
    if (lockstat.st_dev,lockstat.st_ino,hashlib.sha256(lockraw).hexdigest())!=(prepared['lockDev'],prepared['lockIno'],prepared['lockSha256']):
        raise RuntimeError('canonical old lock identity changed')
    if now()>=deadline: raise RuntimeError('host finalization late; canonical lock untouched')
    # Old B/R cohort, caller and release preparer have ALL actually exited.
    # Nonempty gate prevents stale clearDead rmdir; no legacy replacer can race.
    _owner_memory_checkpoint()
    os.unlink(LOCK)
    retired=LOCK.parent/('heavy.lock.p6-retired-'+completed_phase+'-'+str(prepared['lockIno']))
    lib.renameatx_np.argtypes=[C.c_int,C.c_char_p,C.c_int,C.c_char_p,C.c_uint]
    lib.renameatx_np.restype=C.c_int
    if lib.renameatx_np(-2,os.fsencode(gate),-2,os.fsencode(retired),4): raise RuntimeError('owned gate retirement failed')
    os.unlink(retired/'owner.json'); os.rmdir(retired)
    receipt={'state':'EXTERNAL_EXACT_EXIT_AND_COHORT_RECONCILED','classification':prepared['classification'],
             'resourceReleaseOnly':True,
             'oldOwnerIdentity':prepared['oldOwnerIdentity'],'ownerGroupProof':_OWNER_GROUP,
             'hostObservedSha256':allocation['hostObservedSha256'],
             'releaseIdentity':prepared['releaseIdentity'],'actualReleaseReturncode':code,
             'actualReleaseExitObservedNs':str(actual_exit_observed),'operatorDeadlineNs':str(deadline)}
    data=(json.dumps(receipt,sort_keys=True)+'\n').encode()
    if len(data)>4096: raise RuntimeError('host receipt bound')
    fd=os.open(str(BASE/(completed_phase+'-released.json')),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        if os.write(fd,data)!=len(data): raise RuntimeError('host final receipt partial')
        os.fsync(fd)
    finally: os.close(fd)
    if now()>=deadline: raise RuntimeError('host final receipt late; no success claim')
    global _HOST_MANAGED
    _HOST_MANAGED=False
    _owner_memory_checkpoint()
    return receipt


_HOST_MANAGED=False

def _retain_live_host_on_error(operation):
    def guarded(*args,**kwargs):
        try: return operation(*args,**kwargs)
        except BaseException as error:
            if not _HOST_MANAGED: raise
            try:
                data=(json.dumps({'state':'UNKNOWN_HELD','operation':operation.__name__,
                    'hostPid':os.getpid(),'errorType':type(error).__name__,'error':str(error)[:512],
                    'release':False},sort_keys=True)+'\n').encode()
                path=Path('/tmp/p6-membership-vd14-01-permits/host-unknown-held.json')
                fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
                try:
                    if len(data)<=2048: os.write(fd,data)
                    os.fsync(fd)
                finally: os.close(fd)
            except BaseException: pass
            # This existing host is the REAL legacy reservation owner. Never
            # exit it on an UNKNOWN, late wait, missing proof or failed unlink.
            while True: select.select([],[],[],1)
    return guarded

launch_managed_phase=_retain_live_host_on_error(launch_managed_phase)
observe_managed_phase=_retain_live_host_on_error(observe_managed_phase)
finalize_after_actual_wait=_retain_live_host_on_error(finalize_after_actual_wait)


_OWNER_ACTIVE=None
_QUALIFICATION_CHILD=None
_ENTRY_SETUP_NS=None
_OWNER_INTERRUPTED=False
_OWNER_USAGE_LIB=None
_OWNER_SAMPLE_COUNT=0
_OWNER_MEMORY_PEAK=0


def _owner_memory_checkpoint():
    """Actual self counters, including retrospective startup RSS/footprint.

    SDK rusage_info_v4 lifetime_max_phys_footprint is uint64 slot30. Darwin
    getrusage.ru_maxrss is bytes. Neither reports a pre-exec launch timestamp.
    """
    global _OWNER_SAMPLE_COUNT,_OWNER_MEMORY_PEAK,_OWNER_USAGE_LIB
    if _OWNER_INTERRUPTED: raise RuntimeError('operator interruption; retain exact ownership')
    _owner_continuity()
    if _OWNER_USAGE_LIB is None:
        _OWNER_USAGE_LIB=C.CDLL('/usr/lib/libproc.dylib',use_errno=True)
        _OWNER_USAGE_LIB.proc_pid_rusage.argtypes=[C.c_int,C.c_int,C.c_void_p]
        _OWNER_USAGE_LIB.proc_pid_rusage.restype=C.c_int
    def usage(pid):
        values=(C.c_uint64*128)(); C.set_errno(0)
        result=_OWNER_USAGE_LIB.proc_pid_rusage(pid,4,values); error=C.get_errno()
        if result or error or values[30]<values[9]: raise RuntimeError('owner/caller memory counter unavailable')
        return max(int(values[8]),int(values[9]),int(values[30]))
    measured=max(int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss),usage(os.getpid()))
    if _OWNER_ACTIVE is not None:
        # Real direct child remains unreaped. Active tool descendants are charged
        # by the caller/native sampler, not hidden inside this coordinator sum.
        measured+=usage(_OWNER_ACTIVE.pid)+1048576  # Conservative caller diagnostic growth, inside cap.
    _OWNER_SAMPLE_COUNT+=1; _OWNER_MEMORY_PEAK=max(_OWNER_MEMORY_PEAK,measured)
    if measured>700*1048576: raise RuntimeError('owner/caller memory limit')
    return measured


def qualify_nofollow(now, deadline):
    """Fixed read-only Q controls on sealed file, directory and provider link."""
    result = []
    for path,kind,flags in ((CALLER,'regular',os.O_RDONLY|os.O_NOFOLLOW),
                            (SOURCE,'directory',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)):
        _owner_memory_checkpoint()
        if now() >= deadline: raise RuntimeError('Q no-follow control deadline')
        before = path.lstat()
        if not (stat.S_ISREG(before.st_mode) if kind=='regular' else stat.S_ISDIR(before.st_mode)):
            raise RuntimeError('Q no-follow file/directory kind mismatch')
        fd = os.open(str(path),flags)
        try:
            after = os.fstat(fd)
            if (before.st_dev,before.st_ino,stat.S_IFMT(before.st_mode)) != (after.st_dev,after.st_ino,stat.S_IFMT(after.st_mode)):
                raise RuntimeError('Q no-follow descriptor identity mismatch')
        finally: os.close(fd)
        result.append({'path':str(path),'kind':kind,'lstatEqualsNoFollowDescriptor':True})
    link = PYROOT/'bin/python3'
    before = link.lstat()
    if not stat.S_ISLNK(before.st_mode) or before.st_size != len('python3.9') or str(link.readlink()) != 'python3.9':
        raise RuntimeError('Q sealed symlink lstat/readlink mismatch')
    try:
        fd = os.open(str(link),os.O_RDONLY|os.O_NOFOLLOW)
    except OSError as error:
        if error.errno != errno.ELOOP: raise RuntimeError('Q no-follow symlink error is not ELOOP') from None
    else:
        os.close(fd)
        raise RuntimeError('Q no-follow unexpectedly opened symlink')
    after = link.lstat()
    if (before.st_dev,before.st_ino,before.st_mode,before.st_size) != (after.st_dev,after.st_ino,after.st_mode,after.st_size):
        raise RuntimeError('Q no-follow symlink changed')
    result.append({'path':str(link),'kind':'symlink','target':'python3.9','noFollowOpenRejectedEloop':True})
    _owner_memory_checkpoint()
    if now() >= deadline: raise RuntimeError('Q no-follow control completion deadline')
    return result


def require_startup_qualification(allocation, now, deadline):
    """One externally reviewed Q record, pinned by this B/R allocation."""
    expected = allocation.get('startupQualificationEvidenceSha256')
    def is_hash(value):
        return isinstance(value,str) and len(value)==64 and all(ch in '0123456789abcdef' for ch in value)
    if not is_hash(expected): raise RuntimeError('reviewed Q evidence hash required; NOT_QUALIFIED refuses')
    raw = _read(Path('/tmp/p6-membership-vd14-Q01-reviewed.json'),16384)
    if hashlib.sha256(raw).hexdigest() != expected: raise RuntimeError('reviewed Q evidence pin mismatch')
    evidence = json.loads(raw)
    if (set(evidence) != {'version','kind','reviewDisposition','reviewRecordSha256','ownerExternal','qualification'} or
        evidence['version'] != 1 or evidence['kind'] != 'REVIEWED_STARTUP_QUALIFICATION' or
        evidence['reviewDisposition'] != 'ACCEPTED_BY_P3' or not is_hash(evidence['reviewRecordSha256'])):
        raise RuntimeError('explicit reviewed Q disposition required')
    external = evidence['ownerExternal']
    if (set(external) != {'actualExitCode','observedDirectly','captureComplete','terminalEvidenceSha256','exitTimeInBodyClock'} or
        type(external['actualExitCode']) is not int or external['actualExitCode'] != 0 or
        external['observedDirectly'] is not True or external['captureComplete'] is not True or
        external['exitTimeInBodyClock'] != 'NOT_OBSERVED' or not is_hash(external['terminalEvidenceSha256'])):
        raise RuntimeError('external actual Q owner exit and complete capture required')
    q = evidence['qualification']
    expected_controls = [
        {'path':str(CALLER),'kind':'regular','lstatEqualsNoFollowDescriptor':True},
        {'path':str(SOURCE),'kind':'directory','lstatEqualsNoFollowDescriptor':True},
        {'path':str(PYROOT/'bin/python3'),'kind':'symlink','target':'python3.9','noFollowOpenRejectedEloop':True},
    ]
    if q['noFollowControls'] != expected_controls:
        raise RuntimeError('fresh vd14-Q01 no-follow qualification controls required')
    environment = [{'key':key.decode('ascii'),'valueUtf8Bytes':size,'valueSha256':pin}
                   for key,size,pin in STARTUP_PROFILE]
    inputs = {'reviewedInputs':allocation['reviewedInputs'],
              'providerManifestSha256':allocation['providerManifestSha256'],
              'providerLinksSha256':allocation['providerLinksSha256'],
              'profileSha256':hashlib.sha256(json.dumps(environment,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
    group=q['ownerGroupProof']
    proof_arg=json.dumps(group,sort_keys=True,separators=(',',':'))
    _proof_shape(group)
    if (group['uid']!=os.getuid() or len((proof_arg+'\n').encode())>2048 or group['ownerIdentity']!=q['ownerIdentity'] or
        group['singletonMembers'][0]['pid']!=q['ownerIdentity']['pid']):
        raise RuntimeError('fresh Q owner proof binding')
    launch = {'argv':[str(INTERPRETER),'-I','-S','-B',str(CALLER),'qualify-startup',proof_arg],
              'environment':{},'cwd':str(SOURCE)}
    if (q['kind'] != 'STARTUP_QUALIFICATION_ONLY' or q['inputs'] != inputs or q['launch'] != launch or
        q['bootstrapTimeMeasured'] is not False or q['buildAllocated'] is not False or q['runAllocated'] is not False or
        type(q['actualCallerReturncode']) is not int or q['actualCallerReturncode'] != 0 or
        type(q['actualCallerWaitStatus']) is not int or q['actualCallerWaitStatus'] != 0 or
        not is_hash(q['rawCallerSha256'])):
        raise RuntimeError('Q source/provider/profile/launch or actual exit mismatch')
    caller = q['caller']; owner = q['ownerIdentity']
    _pair_shape(caller.get('quietGroupProof'),group,caller['identity'])
    quiet=caller['quietGroupProof']
    members=quiet['members']
    if (caller.get('ownerGroupProof')!=group or len(members)!=2 or
        {row['pid'] for row in members}!={owner['pid'],caller['pid']} or
        any(row['uid']!=group['uid'] or row['sid']!=owner['pid'] or row['pgid']!=owner['pid'] for row in members) or
        next(row for row in members if row['pid']==owner['pid'])!=group['singletonMembers'][0] or
        next(row for row in members if row['pid']==caller['pid'])['ppid']!=owner['pid']):
        raise RuntimeError('fresh Q native quiet group joins')
    if hashlib.sha256((json.dumps(caller,sort_keys=True)+'\n').encode()).hexdigest() != q['rawCallerSha256']:
        raise RuntimeError('reviewed Q raw caller report hash mismatch')
    if (caller['kind'] != 'CALLER_STARTUP_PROFILE' or caller['version'] != 1 or caller['passed'] is not True or
        caller['environment'] != environment or
        caller['flags'] != {'isolated':1,'noSite':1,'ignoreEnvironment':1,'noUserSite':1,'dontWriteBytecode':True} or
        caller['identity']['pid'] != caller['pid'] or caller['parentPid'] != owner['pid']):
        raise RuntimeError('reviewed Q caller identity/profile mismatch')
    for birth in (caller['identity'],owner):
        if (set(birth) != {'pid','sec','usec'} or any(type(birth[k]) is not int for k in birth) or
            birth['pid'] < 2 or not 0 <= birth['sec'] < 2**64 or not 0 <= birth['usec'] < 1000000):
            raise RuntimeError('reviewed Q incarnation invalid')
    samples = caller['memorySamples']; bound = q['twoActorSampledBoundBytes']
    if (not isinstance(samples,list) or len(samples) != 2 or
        any(type(n) is not int or not 0 < n <= 700*1048576 for n in samples) or
        type(bound) is not int or not max(samples) <= bound <= 700*1048576 or
        type(q['ownerMemorySamples']) is not int or q['ownerMemorySamples'] < 1):
        raise RuntimeError('reviewed Q resource outcome invalid')
    stamps = [q[k] for k in ('bodyStartNs','bodyDeadlineNs','actualCallerExitObservedNs','bodyCompletedBeforePublicationNs')]
    if any(not isinstance(v,str) or not 1 <= len(v) <= 24 or not v.isascii() or not v.isdecimal() for v in stamps):
        raise RuntimeError('reviewed Q timing shape invalid')
    start,end,exit_at,complete = map(int,stamps)
    if end-start != 60_000_000_000 or not start <= exit_at <= complete < end or now() >= deadline:
        raise RuntimeError('reviewed Q lateness/deadline outcome invalid')
    if not start<=int(group['singletonObservedNs'])<=int(quiet['observedNs'])<=exit_at:
        raise RuntimeError('Q group observation timing order')


def qualify_startup(input_path, now, started):
    """A separate two-actor qualification. Never enters B/R or admission."""
    global _HOST_MANAGED,_QUALIFICATION_CHILD
    deadline = started + 60_000_000_000
    bundle = json.loads(_read(input_path, 16384))
    if (set(bundle) != {'version','status','phase','bootstrapTimingTrustAccepted','allocation'} or
        bundle['version'] != 1 or bundle['status'] != 'EXPLICITLY_ALLOCATED' or
        bundle['phase'] != 'qualify-startup' or bundle['bootstrapTimingTrustAccepted'] is not True):
        raise RuntimeError('separate explicit startup qualification allocation required')
    allocation = bundle['allocation']
    if (set(allocation) != {'status','phase','platformTrustAccepted','reviewedInputs',
                            'providerManifestSha256','providerLinksSha256'} or
        allocation['status'] != 'EXPLICITLY_ALLOCATED' or allocation['phase'] != 'qualify-startup' or
        allocation['platformTrustAccepted'] is not True):
        raise RuntimeError('exact qualification platform/input allocation required')
    reviewed = allocation['reviewedInputs']
    if not isinstance(reviewed,dict) or len(reviewed) != 13:
        raise RuntimeError('qualification initial role map required')
    manifest = SOURCE/'native-provider-files.sha256'
    links_path = SOURCE/'native-provider-links.json'
    if (_hash(manifest,1048576) != allocation['providerManifestSha256'] or
        _hash(links_path,16384) != allocation['providerLinksSha256']):
        raise RuntimeError('qualification provider metadata pin')
    links = json.loads(links_path.read_text())
    for name,target in links.items():
        if str(Path(name).readlink()) != target: raise RuntimeError('qualification provider link changed')
    provider = {}
    for line in manifest.read_text().splitlines():
        expected,name = line.split('  ',1)
        if name.startswith(str(PYROOT)+'/'): provider[name] = expected
    if not 0 < len(provider) <= 2048: raise RuntimeError('qualification Python provider count')
    for pass_number in (0,1):
        if (_hash(manifest,1048576) != allocation['providerManifestSha256'] or
            _hash(links_path,16384) != allocation['providerLinksSha256']):
            raise RuntimeError('qualification provider metadata changed')
        for name,target in links.items():
            if str(Path(name).readlink()) != target: raise RuntimeError('qualification provider link changed')
        total = 0
        for name,expected in provider.items():
            total += Path(name).stat().st_size
            if total > 64*1048576 or _hash(Path(name),8*1048576) != expected:
                raise RuntimeError('qualification Python provider changed')
            if now() >= deadline: raise RuntimeError('qualification original deadline')
        for path in (CALLER,SOURCE/'native-membership-host-finalize.py'):
            if _hash(path,65536) != reviewed.get(str(path)):
                raise RuntimeError('qualification candidate source pin')
        if now() >= deadline: raise RuntimeError('qualification original deadline')
        nofollow_controls = qualify_nofollow(now,deadline)
        if pass_number: break
        signal.signal(signal.SIGCHLD,signal.SIG_DFL)
        _owner_singleton(now,deadline)
        proof_arg=json.dumps(_OWNER_GROUP,sort_keys=True,separators=(',',':'))
        _HOST_MANAGED = True
        child = subprocess.Popen([str(INTERPRETER),'-I','-S','-B',str(CALLER),'qualify-startup',proof_arg],
            env={},cwd=str(SOURCE),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,close_fds=True)
        _QUALIFICATION_CHILD = child  # Strong ownership survives a failing Q stack.
        streams = [child.stdout,child.stderr]
        buffers = {stream.fileno(): bytearray() for stream in streams}
        limits = {streams[0].fileno():2048,streams[1].fileno():1024}
        pending = set(buffers); status = None
        for stream in streams: os.set_blocking(stream.fileno(),False)
        for _ in range(30000):
            _owner_memory_checkpoint()  # Caller supplies its own retrospective samples below.
            if now() >= deadline: raise RuntimeError('qualification capture/wait deadline')
            for fd in select.select(list(pending),[],[],.002)[0]:
                data = os.read(fd,4096)
                if not data: pending.remove(fd)
                else:
                    buffers[fd].extend(data)
                    if len(buffers[fd]) > limits[fd]: raise RuntimeError('qualification capture bound')
            if status is None:
                waited,raw_status = os.waitpid(child.pid,os.WNOHANG)
                if waited == child.pid:
                    status = raw_status; child.returncode = os.waitstatus_to_exitcode(status)
                    _QUALIFICATION_CHILD = None
                    _HOST_MANAGED = False
                    actual_exit_observed = now()
            if status is not None and not pending: break
        else: raise RuntimeError('qualification observation loop bound')
        raw = bytes(buffers[streams[0].fileno()]); errors = bytes(buffers[streams[1].fileno()])
        for stream in streams: stream.close()
        if child.returncode != 0 or errors or actual_exit_observed >= deadline:
            raise RuntimeError('qualification actual exit or stderr failed')
        receipt = json.loads(raw)
        expected_environment = [{'key':key.decode('ascii'),'valueUtf8Bytes':size,'valueSha256':expected}
                                for key,size,expected in STARTUP_PROFILE]
        expected_flags = {'isolated':1,'noSite':1,'ignoreEnvironment':1,'noUserSite':1,'dontWriteBytecode':True}
        if (set(receipt) != {'version','kind','identity','pid','parentPid','passed','flags','environment','memorySamples','ownerGroupProof','quietGroupProof'} or
            receipt['version'] != 1 or receipt['kind'] != 'CALLER_STARTUP_PROFILE' or
            receipt['pid'] != child.pid or receipt['parentPid'] != os.getpid() or receipt['passed'] is not True or
            receipt['flags'] != expected_flags or receipt['environment'] != expected_environment):
            raise RuntimeError('qualification exact caller metadata mismatch')
        if receipt['ownerGroupProof']!=_OWNER_GROUP: raise RuntimeError('Q proof echo mismatch')
        _pair_shape(receipt.get('quietGroupProof'),_OWNER_GROUP,receipt['identity'])
        _owner_singleton(now,deadline)
        birth = receipt['identity']
        if (not isinstance(birth,dict) or set(birth) != {'pid','sec','usec'} or
            birth['pid'] != child.pid or any(type(birth[k]) is not int for k in birth) or
            not 0 <= birth['sec'] < 2**64 or not 0 <= birth['usec'] < 1000000):
            raise RuntimeError('qualification caller incarnation required')
        samples = receipt['memorySamples']
        if not isinstance(samples,list) or len(samples) != 2 or any(type(n) is not int or not 0 < n <= 700*1048576 for n in samples):
            raise RuntimeError('qualification caller memory evidence required')
        caller_peak = max(samples)
    own_bound = _owner_memory_checkpoint()
    aggregate = max(_OWNER_MEMORY_PEAK,own_bound) + caller_peak
    if aggregate > 700*1048576: raise RuntimeError('qualification two-actor memory bound')
    answer = {'noFollowControls':nofollow_controls,'inputs':{'reviewedInputs':reviewed,'providerManifestSha256':allocation['providerManifestSha256'],
                       'providerLinksSha256':allocation['providerLinksSha256'],
                       'profileSha256':hashlib.sha256(json.dumps(expected_environment,sort_keys=True,separators=(',',':')).encode()).hexdigest()},
              'ownerGroupProof':_OWNER_GROUP,
              'launch':{'argv':[str(INTERPRETER),'-I','-S','-B',str(CALLER),'qualify-startup',proof_arg],
                        'environment':{},'cwd':str(SOURCE)},'ownerIdentity':_birth(os.getpid()),
              'kind':'STARTUP_QUALIFICATION_ONLY','caller':receipt,'rawCallerSha256':hashlib.sha256(raw).hexdigest(),
              'actualCallerReturncode':child.returncode,'actualCallerWaitStatus':status,
              'actualCallerExitObservedNs':str(actual_exit_observed),'bodyStartNs':str(started),
              'bodyDeadlineNs':str(deadline),'bootstrapTimeMeasured':False,
              'twoActorSampledBoundBytes':aggregate,'ownerMemorySamples':_OWNER_SAMPLE_COUNT,
              'buildAllocated':False,'runAllocated':False}
    result = (json.dumps(answer,sort_keys=True)+'\n').encode()
    aggregate = max(aggregate,_owner_memory_checkpoint() + caller_peak)
    if aggregate > 700*1048576: raise RuntimeError('qualification publication memory bound')
    answer['twoActorSampledBoundBytes'] = aggregate
    answer['ownerMemorySamples'] = _OWNER_SAMPLE_COUNT
    result = (json.dumps(answer,sort_keys=True)+'\n').encode()
    answer['bodyCompletedBeforePublicationNs'] = str(now())
    result = (json.dumps(answer,sort_keys=True)+'\n').encode()
    if len(result) > 8192 or now() >= deadline: raise RuntimeError('qualification final receipt bound/deadline')
    if os.write(1,result) != len(result) or now() >= deadline: raise RuntimeError('qualification final publication failed/late')
    return 0


def entry_main(argv):
    """Exactly one job and its release. Never automatically starts B then R."""
    if len(argv)!=4 or argv[1] not in ('build','run','qualify-startup') or argv[2]!='--input' or not os.path.isabs(argv[3]):
        raise RuntimeError('build|run|qualify-startup --input ABSOLUTE_ALLOCATION_BUNDLE')
    if not (sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode):
        raise RuntimeError('requires trusted initial -I -S -B startup')
    # Separate post-import profile, not proof of the initial exec environment.
    if not os.supports_bytes_environ or len(os.environb) != 2 or len(os.environ) != 2:
        raise RuntimeError('exact post-import environment profile required')
    for raw_key, size, expected in STARTUP_PROFILE:
        text_key = raw_key.decode('ascii')
        if raw_key not in os.environb or text_key not in os.environ:
            raise RuntimeError('exact post-import environment keys required')
        raw_value = os.environb[raw_key]
        text_value = os.environ[text_key]
        if len(raw_value) != size or len(text_value) > size:
            raise RuntimeError('exact post-import environment lengths required')
        try:
            decoded = raw_value.decode('utf-8', 'strict')
        except UnicodeError:
            raise RuntimeError('post-import environment UTF-8 required') from None
        if decoded != text_value or hashlib.sha256(raw_value).hexdigest() != expected:
            raise RuntimeError('exact post-import environment identity required')
    global _OWNER_INTERRUPTED,_ENTRY_SETUP_NS
    def interruption(_signum,_frame):
        global _OWNER_INTERRUPTED
        _OWNER_INTERRUPTED=True
    for sig in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP): signal.signal(sig,interruption)
    now=_clock(); first_measured=now(); _ENTRY_SETUP_NS=first_measured; _owner_memory_checkpoint()
    _establish_owner_group(now,first_measured+60_000_000_000)
    if argv[1]=='qualify-startup': return qualify_startup(Path(argv[3]),now,first_measured)
    bundle=json.loads(_read(Path(argv[3]),16384))
    if (set(bundle)!={'version','status','phase','bootstrapTimingTrustAccepted','releaseAllocated','allocation'} or
        bundle['version']!=1 or bundle['status']!='EXPLICITLY_ALLOCATED' or bundle['phase']!=argv[1] or
        bundle['bootstrapTimingTrustAccepted'] is not True or bundle['releaseAllocated'] is not True):
        raise RuntimeError('exact explicit phase/release allocation and bootstrap trust decision required')
    phase=argv[1]; requested=bundle['allocation']
    if requested.get('phase')!=phase: raise RuntimeError('one phase only')
    require_startup_qualification(requested,now,first_measured+60_000_000_000)
    _owner_memory_checkpoint()
    managed,allocated=launch_managed_phase(phase,requested)
    observed=observe_managed_phase(managed,phase,allocated)
    _owner_memory_checkpoint()
    cleanup=dict(requested); cleanup['phase']='release'; cleanup['completedPhase']=phase
    cleanup.update(observed)
    cleanup['reservationSha256']=_hash(BASE/(phase+'-reservation.json'),4096)
    release_child,release_allocation=launch_managed_phase('release',cleanup)
    # Explicitly obtain the atomically complete prepared receipt BEFORE finalizer.
    prepared=BASE/(phase+'-release-prepared.json')
    release_deadline=int(release_allocation['allocationT0Ns'])+2_000_000_000
    for _ in range(400):
        _owner_memory_checkpoint()
        if prepared.exists(): break
        if now()>=release_deadline: raise RuntimeError('release preparation original deadline')
        select.select([],[],[],.005)
    else: raise RuntimeError('release preparation iteration bound')
    prepared_hash=_hash(prepared,16384)
    released=finalize_after_actual_wait(release_child,phase,prepared_hash,release_allocation)
    _owner_memory_checkpoint()
    answer={'kind':'PINNED_CAPABILITY_OWNER','phase':phase,'classification':observed['classification'],
        'resourceReleaseCompleted':True,'ownerIdentity':_birth(os.getpid()),'ownerGroupProof':_OWNER_GROUP,
        'firstMeasuredOwnerNs':str(first_measured),'bootstrapLaunchTimeMeasured':False,
        'startupMemoryAccounting':'kernel RSS highwater and lifetime physical footprint at first checkpoint',
        'ownerCoordinatorSamples':_OWNER_SAMPLE_COUNT,'ownerCallerPeakBytes':_OWNER_MEMORY_PEAK,
        'ownerBootstrapTimeUnmeasured':True,'ownerActualExitCertified':False,'externalTerminalObservationRequired':True,
        'releaseClassification':released['classification']}
    raw=(json.dumps(answer,sort_keys=True)+'\n').encode()
    if len(raw)>4096 or os.write(1,raw)!=len(raw): raise RuntimeError('owner result bound/write')
    return 0 if observed['classification']!='FAILED_QUALIFICATION_COHORT_RETIRED' else 70


if __name__=='__main__':
    try:
        result=entry_main(sys.argv)
    except BaseException as error:
        if _HOST_MANAGED:
            # Real owner remains live while any managed phase/cleanup is uncertain.
            while True: select.select([],[],[],1)
        sys.stderr.write(type(error).__name__+': '+str(error)[:512]+'\n')
        result=70
    sys.exit(result)
