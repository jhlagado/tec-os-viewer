"""Unrun C04-derived phase/release caller. No work on import.
Only the live owner unlinks after actual phase and separate release waits.
"""
import ctypes as C
import errno
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import stat
import subprocess
import sys
import select
from datetime import datetime, timezone

STARTUP_PROFILE = (
    (b'LC_CTYPE', 7, '99fed2d548c2eb1022f4067f97fe838a2c3ea60ee0e0f53086788505c3ababad'),
    (b'__CF_USER_TEXT_ENCODING', 10, 'e52237f479d2cd94721174896f277346c9e3191b21edfbd3bf2f35f71db48e60'),
)

BASE = Path(__file__).resolve().parent
OUT = Path('/tmp/p6-membership-vd14-01')
LOCK = Path('/Users/johnhardy/.origo/heavy.lock')
CC = '/Library/Developer/CommandLineTools/usr/bin/clang'
LD = '/Library/Developer/CommandLineTools/usr/bin/ld'
SDK = '/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk'
NATIVE_SOURCE=str(BASE/'native-membership.c')
LIMIT = 700 * 1024 * 1024
lib = None
proc = None
interrupted = False
reservation_live = False
reviewed = {}
ownership = {}
unresolved_births = set()
phase_name = None
_IDLE_CHECKING=False
_IDLE_MEMORY_SAMPLES=0
_IDLE_MEMORY_PEAK=0
launched_labels=[]
trusted_host=None
owner_group=None
quiet_group=None
PLANS={'build':['compile','link','linked-images','load-commands','signature','kernel-build'], 'run':['trial']}
# Exact SDK layout: rusage_info_v4 begins with UUID then five uint64 counters,
# followed by wired/resident/footprint. Full SDK structure storage is 1024 bytes.

class BSD(C.Structure):
    _fields_ = [(n,C.c_uint32) for n in ('flags','status','xstatus','pid','ppid',
        'uid','gid','ruid','rgid','svuid','svgid','rfu')] + [
        ('comm',C.c_char*16),('name',C.c_char*32)] + [
        (n,C.c_uint32) for n in ('nfiles','pgid','pjobc','tdev','tpgid','nice')] + [
        ('sec',C.c_uint64),('usec',C.c_uint64)]


class Siginfo(C.Structure):
    _fields_=[('signo',C.c_int),('error',C.c_int),('code',C.c_int),('pid',C.c_int),
        ('uid',C.c_uint),('status',C.c_int),('addr',C.c_void_p),('value',C.c_void_p),
        ('band',C.c_long),('pad',C.c_ulong*7)]


# Fixed phase-global diagnostic channel. No new import or emergency JSON encoder.
_D_FIELDS = ('kind','stage','operation','target','returned','errno','expected','deadline',
             'child','birth_sec','birth_usec','authority','terminal','reaped','wait_pid',
             'wait_status','signal_attempted','signal_result','signal_errno','census','hold',
             'reason','normal_sequence','normal_link','normal_file_ack','normal_dir_ack',
             'normal_after_error','first_write','first_file_ack','first_link','first_dir_ack',
             'first_publish_operation','first_publish_errno','last_operation','last_returned',
             'last_errno','last_expected','normal_pending','normal_written','normal_retired','failure_class','observed','bound','native_flavour','native_options','cleanup_identity','hold_reason','cleanup_exception','command_code','finalizer_count','finalizer_operation','finalizer_errno','finalizer_stage')
_D_COMMAND_CODES = {'build-self-start':1,'compile':2,'link':3,'linked-images':4,
                    'load-commands':5,'signature':6,'kernel-build':7,'run-self-start':8,'trial':9}
_D_VALUES = [None] * len(_D_FIELDS)
_D_BUFFERS = None
_D_ACK = None
_D_ACK_OFFSETS = ()
_D_OFFSETS = ()
_D_FDS = []
_D_NAMES = ()
_D_PATHS = ()
_D_READY = False
_D_RESERVED = False
_D_FIRST = False
_D_FINAL = False
_D_CHARGE = 0
_D_PUB = [[None,0,0,0,0,None],[None,0,0,0,0,None]]
_D_NORMAL = [0,0,0,0,0,0,None,0]


class DiagnosticFailure(RuntimeError):
    def __init__(self, operation, target, returned, error, expected, reason=1, observed=None, bound=None):
        self.reason = reason; self.observed=observed; self.bound=bound
        self.native = (operation,target,returned,error,expected)
        RuntimeError.__init__(self, 'NATIVE_OPERATION_FAILED')


class PhaseFailure(RuntimeError):
    def __init__(self, reason, observed=None, bound=None):
        self.reason=reason; self.observed=observed; self.bound=bound
        RuntimeError.__init__(self,'FIXED_PHASE_INVARIANT_FAILED')


def _diag_mark(stage, operation, target=0, expected=0):
    try:
        _D_VALUES[1]=stage; _D_VALUES[2]=operation; _D_VALUES[3]=target
        _D_VALUES[4]=None; _D_VALUES[5]=None; _D_VALUES[6]=expected
        _D_VALUES[43]=None; _D_VALUES[44]=None
    except BaseException: pass


def _diag_native(operation, target, returned, error, expected):
    try:
        _D_VALUES[2]=operation; _D_VALUES[3]=target; _D_VALUES[4]=returned
        _D_VALUES[5]=error; _D_VALUES[6]=expected
    except BaseException: pass


def _diag_reset(until, command_code):
    try:
        _D_VALUES[1]=1; _D_VALUES[2]=26; _D_VALUES[3]=0
        _D_VALUES[4]=None; _D_VALUES[5]=None; _D_VALUES[6]=None
        _D_VALUES[7]=until
        _D_VALUES[8]=0
        _D_VALUES[9]=None
        _D_VALUES[10]=None
        _D_VALUES[11]=0
        _D_VALUES[12]=0
        _D_VALUES[13]=0
        _D_VALUES[14]=None
        _D_VALUES[15]=None
        _D_VALUES[16]=0
        _D_VALUES[17]=None
        _D_VALUES[18]=None
        _D_VALUES[19]=None
        _D_VALUES[20]=0
        _D_VALUES[21]=None
        _D_VALUES[40]=None; _D_VALUES[41]=None; _D_VALUES[42]=None
        _D_VALUES[45]=0; _D_VALUES[46]=0; _D_VALUES[47]=0; _D_VALUES[19]=0; _D_VALUES[48]=command_code
    except BaseException: pass


def _diag_number(buffer, start, value, low, high):
    for offset in range(21): buffer[start+offset] = 32
    buffer[start:start+4] = b'null'
    if type(value) is not int or not low <= value <= high: return
    for offset in range(21): buffer[start+offset] = 32
    negative = value < 0
    if negative: value = -value
    end = start+20
    for _ in range(20):
        buffer[end] = 48+value%10; value //= 10; end -= 1
        if not value: break
    if negative: buffer[end] = 45


def _diag_slot(record, index, value):
    signed = index in (4,5,15,18,32,34,35,51)
    wide = index in (6,7,9,36,41,42)
    low,high = (-2147483648,2147483647) if signed else (0,18446744073709551615) if wide else (0,4294967295)
    _diag_number(_D_BUFFERS[record],_D_OFFSETS[index],value,low,high)


def _diag_ack():
    try:
        for index in range(6):
            _diag_number(_D_ACK,_D_ACK_OFFSETS[index],_D_PUB[1][index],-2147483648,2147483647)
        os.write(2,_D_ACK)
    except BaseException: pass


def _diag_publish(record):
    # One write, one file fsync, one complete-byte link and one directory fsync.
    state = _D_PUB[record]; operation = 1
    try:
        count = os.write(_D_FDS[record],_D_BUFFERS[record]); state[0] = count
        if count != 8192: raise RuntimeError('DIAGNOSTIC_SHORT_WRITE')
        operation = 2; os.fsync(_D_FDS[record]); state[1] = 1
        operation = 3; os.link(_D_PATHS[record*2],_D_PATHS[record*2+1],follow_symlinks=False); state[2] = 1
        operation = 4; os.fsync(_D_FDS[2]); state[3] = 1
    except BaseException as error:
        state[4] = operation; state[5] = error.errno if isinstance(error,OSError) else None
        try: os.write(2,b'DIAGNOSTIC_PUBLICATION_UNCERTAIN\n')
        except BaseException: pass


def _diag_capture(error):
    global _D_FIRST
    if not _D_READY or _D_FIRST: return
    _D_FIRST = True
    try:
        if isinstance(error,DiagnosticFailure):
            _diag_native(*error.native); _D_VALUES[21]=error.reason; _D_VALUES[40]=1 if error.reason==1 else 3; _D_VALUES[41]=error.observed; _D_VALUES[42]=error.bound
        elif isinstance(error,PhaseFailure):
            _D_VALUES[21]=error.reason; _D_VALUES[40]=3; _D_VALUES[41]=error.observed; _D_VALUES[42]=error.bound
        elif isinstance(error,OSError):
            _D_VALUES[4]=-1; _D_VALUES[5]=error.errno; _D_VALUES[21]=2; _D_VALUES[40]=2
        else:
            _D_VALUES[21]=4 if isinstance(error,MemoryError) else 3; _D_VALUES[40]=4
        _D_VALUES[0]=1
        if _D_VALUES[19]==1: _D_VALUES[19]=3
        _D_VALUES[22:27]=_D_NORMAL[:5]; _D_VALUES[37:40]=_D_NORMAL[5:8]
        for index in range(len(_D_FIELDS)): _diag_slot(0,index,_D_VALUES[index])
        _diag_publish(0)
    except BaseException:
        _D_PUB[0][4]=5
        try: os.write(2,b'DIAGNOSTIC_FIRST_ENCODING_UNAVAILABLE\n')
        except BaseException: pass


def _diag_finish(hold):
    global _D_FINAL
    if not _D_READY or not _D_FIRST or _D_FINAL: return
    _D_FINAL=True
    try:
        _D_VALUES[0]=2; _D_VALUES[20]=hold
        _D_VALUES[22:27]=_D_NORMAL[:5]; _D_VALUES[37:40]=_D_NORMAL[5:8]; _D_VALUES[27:33]=_D_PUB[0]
        _D_VALUES[33:37]=(_D_VALUES[2],_D_VALUES[4],_D_VALUES[5],_D_VALUES[6])
        for index in range(len(_D_FIELDS)): _diag_slot(1,index,_D_VALUES[index])
        _diag_publish(1)
    except BaseException:
        _D_PUB[1][4]=5
    _diag_ack()


def _diag_cleanup_error(error):
    try:
        _D_VALUES[47]=1
        if isinstance(error,DiagnosticFailure):
            _diag_native(*error.native); _D_VALUES[21]=error.reason; _D_VALUES[40]=1 if error.reason==1 else 3; _D_VALUES[41]=error.observed; _D_VALUES[42]=error.bound
        elif isinstance(error,PhaseFailure):
            _D_VALUES[21]=error.reason; _D_VALUES[40]=3; _D_VALUES[41]=error.observed; _D_VALUES[42]=error.bound
        elif isinstance(error,OSError):
            _D_VALUES[4]=-1; _D_VALUES[5]=error.errno; _D_VALUES[21]=2; _D_VALUES[40]=2
        else:
            _D_VALUES[21]=4; _D_VALUES[40]=4
        if _D_VALUES[19]==1: _D_VALUES[19]=3
    except BaseException: pass


def _diag_finalizer_error(error, operation):
    if not _D_READY: return
    try:
        count=_D_VALUES[49] if type(_D_VALUES[49]) is int else 0
        _D_VALUES[49]=min(count+1,32); _D_VALUES[50]=operation
        _D_VALUES[51]=error.errno if isinstance(error,OSError) else None
        _D_VALUES[52]=_D_VALUES[1]
        _diag_mark(_D_VALUES[1],operation)
        _diag_capture(error)
        _diag_cleanup_error(error)
    except BaseException: pass


def _diag_reserve(tag, deadline):
    global _D_BUFFERS,_D_OFFSETS,_D_NAMES,_D_PATHS,_D_RESERVED,_D_READY,_D_CHARGE,_D_ACK,_D_ACK_OFFSETS
    if _D_RESERVED: raise RuntimeError('DIAGNOSTIC_PHASE_RESERVE_ALREADY_ATTEMPTED')
    _D_RESERVED = True; _D_CHARGE = 1048576
    _D_VALUES[7] = deadline
    names = (tag+'-first-failure.staged',tag+'-first-failure.json',
             tag+'-cleanup-outcome.staged',tag+'-cleanup-outcome.json')
    _D_NAMES = names; _D_PATHS = tuple(OUT/name for name in names)
    info = OUT.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode&0o077:
        raise RuntimeError('DIAGNOSTIC_PRIVATE_OUT_REQUIRED')
    for index in (1,3):
        try: _D_PATHS[index].lstat()
        except FileNotFoundError: pass
        else: raise RuntimeError('DIAGNOSTIC_FINAL_NAME_ALREADY_EXISTS')
    quota(); idle_memory_checkpoint()
    offsets = []; buffers = []
    for record in (0,1):
        buffer = bytearray(b' '*8192); position = 1; buffer[0] = 123
        for index,name in enumerate(_D_FIELDS):
            key = b'"'+name.encode('ascii')+b'":'
            buffer[position:position+len(key)] = key; position += len(key)
            if record == 0: offsets.append(position)
            buffer[position:position+4] = b'null'; position += 21
            buffer[position] = 44 if index+1<len(_D_FIELDS) else 125; position += 1
        if position >= 8191: raise RuntimeError('DIAGNOSTIC_SCHEMA_BOUND')
        buffer[8191] = 10; buffers.append(buffer)
    _D_BUFFERS = buffers; _D_OFFSETS = tuple(offsets)
    _D_ACK=bytearray(b' '*256); prefix=b'{"cleanup_publication_ack":['
    _D_ACK[:len(prefix)]=prefix; position=len(prefix); ack_offsets=[]
    for index in range(6):
        ack_offsets.append(position); _D_ACK[position:position+4]=b'null'; position+=21
        _D_ACK[position]=44 if index<5 else 93; position+=1
    _D_ACK[position]=125; _D_ACK[255]=10; _D_ACK_OFFSETS=tuple(ack_offsets)
    try:
        for index in (0,2):
            fd = os.open(str(_D_PATHS[index]),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            _D_FDS.append(fd)
            if not 3 <= fd < 1024: raise RuntimeError('DIAGNOSTIC_FD_RANGE')
        _D_FDS.append(os.open(str(OUT),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW))
        if not 3 <= _D_FDS[2] < 1024: raise RuntimeError('DIAGNOSTIC_FD_RANGE')
        os.fsync(_D_FDS[2]); quota(); idle_memory_checkpoint()
        _D_VALUES[48]=0; _D_VALUES[49]=0; _D_READY = True
    except BaseException:
        for fd in _D_FDS:
            try: os.close(fd)
            except OSError: pass
        _D_FDS.clear()
        raise


def identity(pid):
    # Published XNU requires arg=1 to include retained zombie incarnations.
    b=BSD(); C.set_errno(0)
    n=proc.proc_pidinfo(pid,3,1,C.byref(b),C.sizeof(b)); error=C.get_errno()
    try: _D_VALUES[43]=3; _D_VALUES[44]=1
    except BaseException: pass
    _diag_native(1,pid,n,error,C.sizeof(b))
    if n!=C.sizeof(b) or error:
        raise DiagnosticFailure(1,pid,n,error,C.sizeof(b))
    if b.pid!=pid:
        raise DiagnosticFailure(1,pid,n,error,C.sizeof(b),20,b.pid,pid)
    return {'pid':b.pid,'ppid':b.ppid,'pgid':b.pgid,'sec':b.sec,'usec':b.usec,'status':b.status}


def key(row): return (row['pid'],row['sec'],row['usec'])


def precise(row): return {n:row[n] for n in ('pid','sec','usec')}


def role_pins():
    return {str(BASE/n):reviewed[str(BASE/n)] for n in ('native-membership-caller.py','native-membership-host-finalize.py')}


def group_row(pid):
    def read():
        b=BSD(); C.set_errno(0)
        n=proc.proc_pidinfo(pid,3,1,C.byref(b),136); error=C.get_errno()
        _D_VALUES[43]=3; _D_VALUES[44]=1
        _diag_native(1,pid,n,error,136)
        if n!=136 or error: raise DiagnosticFailure(1,pid,n,error,136)
        if b.pid!=pid or b.status==5 or not 0<=b.usec<1000000: raise PhaseFailure(196)
        return {k:int(getattr(b,k)) for k in ('pid','ppid','uid','pgid','sec','usec')}
    row=read(); values=[]
    for op,code in (('getsid',30),('getpgid',31)):
        C.set_errno(0); result=getattr(lib,op)(pid); error=C.get_errno()
        _D_VALUES[43]=None; _D_VALUES[44]=None
        _diag_native(code,pid,result,error,2)
        if result<2 or error: raise DiagnosticFailure(code,pid,result,error,2)
        values.append(result)
    if row!=read() or values[1]!=row['pgid']: raise PhaseFailure(196)
    row['sid']=values[0]
    return row


def bind_group(proof, current=True):
    global owner_group
    keys={'version','ownerIdentity','uid','sid','pgid','singletonMembers','singletonObservedNs','premise'}
    if not isinstance(proof,dict) or set(proof)!=keys: raise PhaseFailure(195)
    raw=(json.dumps(proof,sort_keys=True)+'\n').encode()
    birth=proof['ownerIdentity']; rows=proof['singletonMembers']; stamp=proof['singletonObservedNs']
    if (len(raw)>2048 or type(proof['version']) is not int or proof['version']!=1 or
        (current and birth!=trusted_host) or not isinstance(rows,list) or len(rows)!=1 or
        not isinstance(stamp,str) or not stamp.isascii() or not stamp.isdecimal() or not 1<=len(stamp)<=24 or
        proof['premise']!='COMPLETE_BOUNDED_GROUP_NOT_CONSUMER_TABLE'):
        raise PhaseFailure(195)
    row=rows[0]
    if (not isinstance(birth,dict) or set(birth)!={'pid','sec','usec'} or
        not isinstance(row,dict) or set(row)!={'pid','ppid','uid','pgid','sid','sec','usec'} or
        any(type(v) is not int for v in row.values()) or any(type(v) is not int for v in birth.values()) or
        not 2<=row['pid']<=2147483647 or not 0<=row['sec']<2**64 or not 0<=row['usec']<1000000 or
        not 0<=row['uid']<2**32 or not 1<=row['ppid']<=2147483647 or
        precise(row)!=birth or any(type(proof[k]) is not int or proof[k]!=row[k] for k in ('uid','sid','pgid')) or
        row['sid']!=row['pid'] or row['pgid']!=row['pid'] or row['uid']!=os.getuid()):
        raise PhaseFailure(195)
    if current:
        owner_group=proof
        owner_continuity()


def owner_continuity():
    if owner_group is None: return
    pid=trusted_host['pid']
    if (os.getppid()!=pid or group_row(pid)!=owner_group['singletonMembers'][0] or
        os.getsid(0)!=pid or os.getpgrp()!=pid): raise PhaseFailure(196)


def quiet_pair(now, until):
    owner_continuity(); pid=trusted_host['pid']; expected={pid,os.getpid()}
    if now()>=until or int(owner_group['singletonObservedNs'])>now(): raise PhaseFailure(198)
    if ids('proc_listpgrppids',pid)!=expected: raise PhaseFailure(197)
    rows=[group_row(p) for p in sorted(expected)]
    if (any(r['uid']!=owner_group['uid'] or r['sid']!=pid or r['pgid']!=pid for r in rows) or
        next(r for r in rows if r['pid']==pid)!=owner_group['singletonMembers'][0] or
        next(r for r in rows if r['pid']==os.getpid())['ppid']!=pid): raise PhaseFailure(197)
    if ids('proc_listpgrppids',pid)!=expected or rows!=[group_row(p) for p in sorted(expected)]:
        raise PhaseFailure(199)
    stamp=now()
    if stamp>=until: raise PhaseFailure(198)
    return {'observedNs':str(stamp),'members':rows}


def retained_pair(pair, child):
    if (not isinstance(child,dict) or set(child)!={'pid','sec','usec'} or
        any(type(v) is not int for v in child.values())): raise PhaseFailure(197)
    if not isinstance(pair,dict) or set(pair)!={'observedNs','members'}: raise PhaseFailure(197)
    stamp=pair['observedNs']; rows=pair['members']; pid=trusted_host['pid']
    if (not isinstance(stamp,str) or not stamp.isascii() or not stamp.isdecimal() or not 1<=len(stamp)<=24 or
        not isinstance(rows,list) or len(rows)!=2 or any(not isinstance(r,dict) or
        set(r)!={'pid','ppid','uid','pgid','sid','sec','usec'} or any(type(v) is not int for v in r.values()) for r in rows)):
        raise PhaseFailure(197)
    if ({r['pid'] for r in rows}!={pid,child['pid']} or child['pid']==pid or
        any(r['uid']!=owner_group['uid'] or r['sid']!=pid or r['pgid']!=pid for r in rows) or
        next(r for r in rows if r['pid']==pid)!=owner_group['singletonMembers'][0]): raise PhaseFailure(197)
    row=next(r for r in rows if r['pid']==child['pid'])
    if precise(row)!=child or row['ppid']!=pid: raise PhaseFailure(197)
    if (not 2<=child['pid']<=2147483647 or not 0<=child['sec']<2**64 or not 0<=child['usec']<1000000 or
        int(stamp)<int(owner_group['singletonObservedNs'])): raise PhaseFailure(197)


def ids(operation, value):
    buf=(C.c_int*128)(); C.set_errno(0)
    n=getattr(proc,operation)(value,buf,C.sizeof(buf)); error=C.get_errno()
    try: _D_VALUES[43]=1 if operation=='proc_listpgrppids' else 2; _D_VALUES[44]=None
    except BaseException: pass
    _diag_native(2 if operation=='proc_listpgrppids' else 21,value,n,error,C.sizeof(buf))
    if error or n<0: raise DiagnosticFailure(2 if operation=='proc_listpgrppids' else 21,value,n,error,C.sizeof(buf))
    if n>=128: raise DiagnosticFailure(2 if operation=='proc_listpgrppids' else 21,value,n,error,C.sizeof(buf),20,n,127)
    result=set(int(buf[i]) for i in range(n))
    if len(result)!=n or any(pid<2 for pid in result): raise PhaseFailure(100)
    return result


def cohort(root, until, now):
    owner_continuity()
    # root is an unreaped private-session leader, never an ambient group number.
    lease=ownership[root]; row=identity(root)
    if key(row)!=lease['key'] or row['pgid']!=root: raise PhaseFailure(101)
    group=ids('proc_listpgrppids',root)
    if root not in group: raise PhaseFailure(102)
    candidates=set(group); queue=list(group); births={}; total=memory(os.getpid())+_D_CHARGE
    host_before=identity(trusted_host['pid'])
    if precise(host_before)!=trusted_host or os.getppid()!=trusted_host['pid']: raise PhaseFailure(103)
    total+=memory(trusted_host['pid'])
    if precise(identity(trusted_host['pid']))!=trusted_host: raise PhaseFailure(104)
    while queue:
        if now()>=until: raise PhaseFailure(905)
        if len(candidates)>127: raise PhaseFailure(108)
        pid=queue.pop(); a=identity(pid)
        if a['pgid']!=root: raise PhaseFailure(109)
        if pid in lease['known'] and lease['known'][pid]!=key(a): raise PhaseFailure(110)
        lease['known'][pid]=key(a); births[pid]=key(a)
        # Zombie is retained by a wait owner; it has no resident executable.
        if a['status']!=5: total+=memory(pid)
        b=identity(pid)
        if key(a)!=key(b) or a['ppid']!=b['ppid'] or a['pgid']!=b['pgid']:
            raise PhaseFailure(111)
        children=ids('proc_listchildpids',pid)
        for child in children-candidates: candidates.add(child); queue.append(child)
        if total>LIMIT: raise PhaseFailure(112,total,LIMIT)
    for pid,birth in lease['known'].items():
        if pid in candidates: continue
        if now()>=until: raise PhaseFailure(113)
        old=BSD(); C.set_errno(0)
        n=proc.proc_pidinfo(pid,3,1,C.byref(old),C.sizeof(old)); error=C.get_errno()
        try: _D_VALUES[43]=3; _D_VALUES[44]=1
        except BaseException: pass
        _diag_native(22,pid,n,error,C.sizeof(old))
        if n==0 and error==errno.ESRCH: continue  # Explicit known-incarnation disappearance only.
        if n!=C.sizeof(old) or error: raise DiagnosticFailure(22,pid,n,error,C.sizeof(old))
        if (old.pid,old.sec,old.usec)!=birth: raise PhaseFailure(115)
        raise PhaseFailure(105)
    if ids('proc_listpgrppids',root)!=group: raise PhaseFailure(106)
    for pid,birth in births.items():
        if key(identity(pid))!=birth: raise PhaseFailure(116)
    owner_continuity()
    if now()>=until: raise PhaseFailure(107)
    return total,candidates


def verify(path, maximum):
    name=str(Path(path).absolute())
    expected=reviewed.get(name)
    _diag_mark(_D_VALUES[1],11,0,64)
    if expected is None: raise PhaseFailure(901)
    actual=digest(Path(name).resolve(),maximum)
    _diag_mark(_D_VALUES[1],11,0,64)
    if actual!=expected: raise PhaseFailure(902)
    return actual


def initialize(qualification=False):
    global lib, proc
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
    if qualification:
        return {'flags': {'isolated': sys.flags.isolated, 'noSite': sys.flags.no_site,
                          'ignoreEnvironment': sys.flags.ignore_environment,
                          'noUserSite': sys.flags.no_user_site,
                          'dontWriteBytecode': bool(sys.dont_write_bytecode)},
                'environment': [{'key': key.decode('ascii'), 'valueUtf8Bytes': size,
                                 'valueSha256': expected}
                                for key, size, expected in STARTUP_PROFILE]}
    signal.signal(signal.SIGCHLD, signal.SIG_DFL)
    lib = C.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    lib.mach_continuous_time.restype = C.c_uint64
    lib.mach_continuous_time.argtypes = []
    lib.mach_timebase_info.argtypes = [C.c_void_p]
    lib.mach_timebase_info.restype = C.c_int
    proc = C.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    proc.proc_pid_rusage.argtypes = [C.c_int, C.c_int, C.c_void_p]
    proc.proc_pid_rusage.restype = C.c_int
    proc.proc_pidinfo.argtypes=[C.c_int,C.c_int,C.c_uint64,C.c_void_p,C.c_int]
    proc.proc_pidinfo.restype=C.c_int
    for op in ('proc_listpgrppids','proc_listchildpids'):
        getattr(proc,op).argtypes=[C.c_int,C.c_void_p,C.c_int]; getattr(proc,op).restype=C.c_int
    for op in ('getsid','getpgid'):
        getattr(lib,op).argtypes=[C.c_int]; getattr(lib,op).restype=C.c_int
    lib.waitid.argtypes=[C.c_int,C.c_uint,C.POINTER(Siginfo),C.c_int]; lib.waitid.restype=C.c_int
    if C.sizeof(BSD)!=136 or C.sizeof(Siginfo)!=104: raise RuntimeError('SDK ABI mismatch')
    def remember(_signum, _frame):
        global interrupted
        interrupted = True
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP): signal.signal(sig, remember)
    tb = (C.c_uint32 * 2)()
    if lib.mach_timebase_info(tb) or not tb[1]: raise RuntimeError('clock')
    return lambda: lib.mach_continuous_time() * tb[0] // tb[1]


def regular(path, maximum, private=False):
    idle_memory_checkpoint()
    _diag_mark(_D_VALUES[1],15,0,maximum)
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW)
    try:
        _diag_mark(_D_VALUES[1],24)
        s = os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_size<0 or s.st_size > maximum or (private and (s.st_uid!=os.getuid() or s.st_mode&0o077)): raise PhaseFailure(117)
        _diag_mark(_D_VALUES[1],14,0,maximum+1)
        raw = os.read(fd, maximum + 1)
        idle_memory_checkpoint()
        _diag_mark(_D_VALUES[1],24); after=os.fstat(fd)
        if len(raw)!=s.st_size or (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            raise PhaseFailure(118)
        return raw
    except BaseException as primary:
        _diag_capture(primary)
        raise
    finally:
        try: os.close(fd)
        except BaseException as finalizer:
            _diag_finalizer_error(finalizer,27)
            raise


def digest(path, maximum):
    _diag_mark(_D_VALUES[1],15,0,maximum)
    fd=os.open(str(path),os.O_RDONLY|os.O_NOFOLLOW)
    try:
        _diag_mark(_D_VALUES[1],24); before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size>maximum: raise PhaseFailure(119)
        h=hashlib.sha256(); total=0
        while True:
            idle_memory_checkpoint()
            _diag_mark(_D_VALUES[1],14,0,65536); raw=os.read(fd,65536)
            idle_memory_checkpoint()
            if not raw: break
            total+=len(raw)
            if total>maximum: raise PhaseFailure(121)
            h.update(raw)
        _diag_mark(_D_VALUES[1],24); after=os.fstat(fd)
        if total!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
            raise PhaseFailure(120)
        return h.hexdigest()
    except BaseException as primary:
        _diag_capture(primary)
        raise
    finally:
        try: os.close(fd)
        except BaseException as finalizer:
            _diag_finalizer_error(finalizer,27)
            raise


def write(path, obj):
    _D_NORMAL[0]+=1; _D_NORMAL[1:]=[0,0,0,0,0,None,0]
    try:
        idle_memory_checkpoint()
        raw=(json.dumps(obj,sort_keys=True)+'\n').encode()
        if len(raw)>65536: raise PhaseFailure(122,len(raw),65536)
        pending=Path(str(path)+'.pending-'+str(os.getpid()))
        _diag_mark(8,7); _D_NORMAL[5]=1
        fd=os.open(str(pending),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        _D_NORMAL[5]=2
        try:
            _diag_mark(8,7,0,len(raw)); count=os.write(fd,raw); _D_NORMAL[6]=count
            if count!=len(raw): raise PhaseFailure(123)
            _diag_mark(8,8); _D_NORMAL[2]=1; os.fsync(fd); _D_NORMAL[2]=2
        except BaseException as primary:
            _D_NORMAL[4]=1; _diag_capture(primary)
            raise
        finally:
            try: os.close(fd)
            except BaseException as finalizer:
                _D_NORMAL[4]=1; _diag_finalizer_error(finalizer,27)
                raise
        _diag_mark(8,9); _D_NORMAL[1]=1
        os.link(pending,path,follow_symlinks=False); _D_NORMAL[1]=2
        _diag_mark(8,16); _D_NORMAL[7]=1; os.unlink(pending); _D_NORMAL[7]=2
        directory=os.open(str(path.parent),os.O_RDONLY|os.O_DIRECTORY)
        try:
            _diag_mark(8,8); _D_NORMAL[3]=1; os.fsync(directory); _D_NORMAL[3]=2
        except BaseException as primary:
            _D_NORMAL[4]=1; _diag_capture(primary)
            raise
        finally:
            try: os.close(directory)
            except BaseException as finalizer:
                _D_NORMAL[4]=1; _diag_finalizer_error(finalizer,27)
                raise
        idle_memory_checkpoint()
    except BaseException as primary:
        _D_NORMAL[4]=1; _diag_capture(primary)
        raise


def memory(pid):
    data = (C.c_uint64 * 128)()
    C.set_errno(0); returned=proc.proc_pid_rusage(pid,4,data); error=C.get_errno()
    try: _D_VALUES[43]=4; _D_VALUES[44]=None
    except BaseException: pass
    _diag_native(3,pid,returned,error,C.sizeof(data))
    if returned or error: raise DiagnosticFailure(3,pid,returned,error,C.sizeof(data))
    # SDK rusage_info_v4 ri_resident_size and ri_phys_footprint offsets64/72.
    if data[30]<data[9]: raise DiagnosticFailure(3,pid,returned,error,C.sizeof(data),20,data[30],data[9])
    value=max(data[8],data[9],data[30])
    if pid==os.getpid(): value=max(value,int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss))
    return value


def idle_memory_checkpoint():
    global _IDLE_CHECKING,_IDLE_MEMORY_SAMPLES,_IDLE_MEMORY_PEAK
    if _IDLE_CHECKING or proc is None: return
    _IDLE_CHECKING=True
    try:
        owner_continuity()
        own=memory(os.getpid()); total=own+_D_CHARGE
        if trusted_host is not None:
            if os.getppid()!=trusted_host['pid'] or precise(identity(trusted_host['pid']))!=trusted_host:
                raise PhaseFailure(125)
            total+=memory(trusted_host['pid'])
        # During active commands the existing complete group/native sampler owns
        # descendant accounting. These idle checks never purport to replace it.
        active=unresolved_births or any(not lease['reaped'] for lease in ownership.values())
        if not active:
            _IDLE_MEMORY_SAMPLES+=1; _IDLE_MEMORY_PEAK=max(_IDLE_MEMORY_PEAK,total)
        if total>LIMIT: raise PhaseFailure(124,total,LIMIT)
    finally: _IDLE_CHECKING=False


def quota():
    # Full diagnostic reserve replaces its actual entries/bytes, never adds allowance.
    total=32768 if _D_RESERVED else 0; count=4 if _D_RESERVED else 0
    scan_primary=None; scan_entered=False
    try:
        _diag_mark(_D_VALUES[1],29)
        with os.scandir(OUT) as entries:
            scan_entered=True
            try:
                for item in entries:
                    info=item.stat(follow_symlinks=False)
                    if not stat.S_ISREG(info.st_mode) or info.st_size>1048576:
                        raise PhaseFailure(126)
                    if _D_RESERVED and item.name in _D_NAMES:
                        if info.st_size>8192: raise PhaseFailure(128)
                        continue
                    count+=1; total+=info.st_size
                    if count>64 or total>3*1048576: raise PhaseFailure(127,count if count>64 else total,64 if count>64 else 3*1048576)
            except BaseException as primary:
                scan_primary=primary; _diag_capture(primary)
                raise
    except BaseException as finalizer:
        if scan_entered and (scan_primary is None or finalizer is not scan_primary):
            _diag_finalizer_error(finalizer,28)
        elif scan_primary is None: _diag_capture(finalizer)
        raise



def child_limits():
    resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def command(argv, until, now, label, capture=8192, trial=False, keep_on_failure=False):
    _diag_reset(until,_D_COMMAND_CODES.get(label,0))
    channels=[]; readfds=[]; child=None; terminal=False; status=None; released=False; authority=False
    output=bytearray(); errors=bytearray(); samples=0; peak=0; initial=None
    try:
        _diag_mark(1,11); start=now(); verify(Path(argv[0]),512*1048576)
        if start>=until or now()>=until: raise PhaseFailure(129)
        _diag_mark(2,13)
        for _ in range(2):
            _diag_mark(2,18); r,w=os.pipe(); channels.append((r,w)); readfds.append(r)
            os.set_blocking(r,False)
        if trial:
            trialfd=os.open(str(OUT/'trial-receipt.json'),os.O_RDWR|os.O_CREAT|os.O_EXCL,0o600)
        else: trialfd=None
        unresolved_births.add(label)
        _diag_mark(2,19); child=os.fork()
        if child==0:
            try:
                signal.signal(signal.SIGCHLD,signal.SIG_DFL); child_limits()
                os.setsid()  # Private SID/PGID before stop; parent binds exact direct child.
                null=os.open('/dev/null',os.O_RDWR)
                os.dup2(null,0); os.dup2(trialfd if trial else channels[0][1],1); os.dup2(channels[1][1],2)
                os.closerange(3,1024)
                os.kill(os.getpid(),signal.SIGSTOP)
                os.chdir(OUT); os.execve(argv[0],argv,{})
            except BaseException: os._exit(126)
        authority=True; launched_labels.append(label)
        ownership[child]={'label':label,'key':None,'known':{},'argv':argv,'reaped':False}
        unresolved_births.discard(label)
        try: _D_VALUES[8]=child; _D_VALUES[11]=1
        except BaseException: pass
        # All exceptional paths below retain this PID and its wait authority.
        for _,w in channels: os.close(w)
        _diag_mark(3,4,child,C.sizeof(Siginfo)); info=Siginfo()
        for _ in range(12000):
            try: _D_VALUES[43]=1; _D_VALUES[44]=0x08|0x01|0x20
            except BaseException: pass
            C.set_errno(0); returned=lib.waitid(1,child,C.byref(info),0x08|0x01|0x20)
            if returned: authority=False
            error=C.get_errno()
            _diag_native(4,child,returned,error,C.sizeof(info))
            if returned:
                _D_VALUES[11]=0; raise DiagnosticFailure(4,child,returned,error,C.sizeof(info))
            if info.pid==child: break
            if now()>=until: raise PhaseFailure(136)
            select.select([],[],[],.005)
        if info.pid!=child or info.code!=5 or info.status!=signal.SIGSTOP:
            raise PhaseFailure(130)
        row=identity(child)
        if row['ppid']!=os.getpid() or row['pgid']!=child: raise PhaseFailure(131)
        ownership[child]['key']=key(row); ownership[child]['known']={child:key(row)}
        try: _D_VALUES[9]=row['sec']; _D_VALUES[10]=row['usec']
        except BaseException: pass
        _diag_mark(4,3,child)
        # Mandatory complete initial cohort sample; fast commands cannot get samples=0.
        peak,members=cohort(child,until,now); samples=1
        _diag_mark(4,6,child,signal.SIGCONT); os.kill(child,signal.SIGCONT)
        _diag_mark(5,13,child)
        failed=None
        for _ in range(12000):
            for fd,buf in zip(readfds,(output,errors)):
                _diag_mark(5,14,child)
                try: raw=os.read(fd,min(4096,capture+1-len(buf)))
                except BlockingIOError: raw=b''
                buf.extend(raw)
                if len(buf)>capture: raise PhaseFailure(139,len(buf),capture)
            if trial:
                trial_size=os.fstat(trialfd).st_size
                if trial_size>4096: raise PhaseFailure(137,trial_size,4096)
            if interrupted: raise PhaseFailure(903)
            if now()>=until: raise PhaseFailure(138)
            # R supervisor already sums its exact 3-actor scope; B includes all
            # descendants in private group plus kernel-confirmed child branches.
            if not trial:
                quota()
                amount,members=cohort(child,until,now); samples+=1; peak=max(peak,amount)
            info=Siginfo()
            try: _D_VALUES[43]=1; _D_VALUES[44]=0x04|0x01|0x20
            except BaseException: pass
            C.set_errno(0); returned=lib.waitid(1,child,C.byref(info),0x04|0x01|0x20)
            if returned: authority=False
            error=C.get_errno()
            _diag_native(4,child,returned,error,C.sizeof(info))
            if returned:
                _D_VALUES[11]=0; raise DiagnosticFailure(4,child,returned,error,C.sizeof(info))
            terminal=info.pid==child and info.code in (1,2,3); _D_VALUES[12]=1 if terminal else 0
            if terminal:
                # Keep zombie root/group anchor until BOTH final censuses are root-only.
                _diag_mark(6,2,child); _D_VALUES[19]=1
                for _ in range(2):
                    _,members=cohort(child,until,now)
                    if members!={child}: raise PhaseFailure(141)
                _D_VALUES[19]=2; _diag_mark(6,5,child)
                try: waited,status=os.waitpid(child,0)
                except BaseException:
                    authority=False; _D_VALUES[11]=0; raise
                authority=False
                if waited!=child:
                    try: _D_VALUES[11]=0; _D_VALUES[14]=waited; _D_VALUES[15]=status
                    except BaseException: pass
                    raise PhaseFailure(140)
                released=True
                ownership[child]['reaped']=True
                try: _D_VALUES[11]=0; _D_VALUES[13]=1; _D_VALUES[14]=waited; _D_VALUES[15]=status
                except BaseException: pass
                break
            select.select([],[],[],.005)
        if not released: raise PhaseFailure(132)
        for fd,buf in zip(readfds,(output,errors)):
            try: buf.extend(os.read(fd,max(1,capture+1-len(buf))))
            except BlockingIOError: pass
        if now()>=until: raise PhaseFailure(904)
        if len(output)>capture or len(errors)>capture: raise PhaseFailure(133)
        code=os.waitstatus_to_exitcode(status)
        verify(Path(argv[0]),512*1048576)
        write(OUT/(label+'.json'), {'commandLabel':label,'argv':argv,'rootIdentity':row,'exactChildExit':True,
            'ownerGroupProof':owner_group,
            'scopeEmptyWhileAnchorRetained':True,'returncode':code,'startNs':str(start),
            'capturedNs':str(now()),'stdoutHex':output.hex(),'stderrHex':errors.hex(),
            'samples':samples,'peakSampleBytes':peak,'diagnosticGrowthChargeBytes':_D_CHARGE,'release':False})
        ownership[child]['receipt']=label+'.json'
        if code!=0: raise PhaseFailure(134)
        if label in ('compile','link') and errors: raise PhaseFailure(135)
        quota(); result=bytes(output)
        try: _D_VALUES[48]=0
        except BaseException: pass
        return result
    except BaseException as cause:
        _D_VALUES[11]=1 if authority else 0; _D_VALUES[13]=1 if released else _D_VALUES[13]
        _diag_capture(cause)
        if child is None: unresolved_births.discard(label)
        # No kill/wait shortcut purports to clean descendants. Keep the global
        # owner LIVE on every uncertain path; SIGTERM only sets the operator latch.
        if child is not None and not released:
            try:
                write(OUT/(label+'-held.json'), {'state':'UNKNOWN_HELD','childPid':child,
                    'rootBound':child in ownership and ownership[child]['key'] is not None,'terminalObserved':terminal,'release':False,
                    'stdoutHex':output.hex(),'stderrHex':errors.hex()})
            except BaseException as projection_error: _diag_cleanup_error(projection_error)
            authority=authority and child in ownership and ownership[child]['key'] is not None
            _diag_mark(7,13,child); signal_error=None
            if not trial and authority:
                try:
                    _D_VALUES[45]=1; anchor=identity(child)
                    if key(anchor)!=ownership[child]['key'] or anchor['pgid']!=child:
                        _D_VALUES[45]=3
                        raise PhaseFailure(900)
                    _diag_mark(7,23,child)
                    session=os.getsid(child)
                    _diag_native(23,child,session,0,child)
                    if session!=child:
                        _D_VALUES[45]=3
                        raise PhaseFailure(142)
                    _D_VALUES[45]=2
                    _diag_mark(7,6,child,signal.SIGKILL); _D_VALUES[16]=1
                    os.killpg(child,signal.SIGKILL)  # Private SID/PGID pinned by unreaped leader.
                    _D_VALUES[17]=1; _D_VALUES[18]=0
                except BaseException as error:
                    signal_error=error.errno if isinstance(error,OSError) else None
                    _D_VALUES[17]=2 if isinstance(error,OSError) and _D_VALUES[16]==1 else None; _D_VALUES[18]=signal_error
                    # Even ESRCH is not an empty/reap certificate; remain held.
                    authority=False
                    if _D_VALUES[45]==1: _D_VALUES[45]=4
                    _diag_cleanup_error(error)
            if authority:
                try:
                    for _ in range(12000):
                        if now()>=until:
                            _D_VALUES[21]=5; break
                        info=Siginfo()
                        try: _D_VALUES[43]=1; _D_VALUES[44]=0x04|0x01|0x20
                        except BaseException: pass
                        C.set_errno(0); returned=lib.waitid(1,child,C.byref(info),0x04|0x01|0x20)
                        if returned: authority=False
                        error=C.get_errno()
                        _diag_native(4,child,returned,error,C.sizeof(info))
                        if returned:
                            authority=False; _D_VALUES[11]=0; _D_VALUES[21]=6; break
                        if info.pid==child and info.code in (1,2,3):
                            _D_VALUES[12]=1
                            _D_VALUES[19]=1
                            for _ in range(2):
                                _,members=cohort(child,until,now)
                                if members!={child}: raise PhaseFailure(144)
                            _D_VALUES[19]=2; _diag_mark(7,5,child)
                            try: waited,status=os.waitpid(child,0)
                            except BaseException:
                                authority=False; _D_VALUES[11]=0; raise
                            authority=False
                            if waited!=child:
                                try: _D_VALUES[11]=0; _D_VALUES[14]=waited; _D_VALUES[15]=status
                                except BaseException: pass
                                raise PhaseFailure(143)
                            released=True; ownership[child]['reaped']=True
                            try: _D_VALUES[11]=0; _D_VALUES[13]=1; _D_VALUES[14]=waited; _D_VALUES[15]=status
                            except BaseException: pass
                            write(OUT/(label+'-cleanup.json'),{'commandLabel':label,'rootIdentity':row,
                                'ownerGroupProof':owner_group,
                                'exactChildExit':True,'scopeEmptyWhileAnchorRetained':True,
                                'returncode':os.waitstatus_to_exitcode(status),'qualification':'FAILED',
                                'firstFailure':'FIXED_DIAGNOSTIC_RECORD','signalErrno':signal_error,'release':False})
                            ownership[child]['receipt']=label+'-cleanup.json'
                            break
                        select.select([],[],[],.005)
                except BaseException as cleanup_error:
                    _diag_cleanup_error(cleanup_error)
            if not released:
                _D_VALUES[11]=1 if authority else 0
                _D_VALUES[46]=3 if _D_VALUES[21]==6 else 2 if _D_VALUES[21]==5 else 4 if _D_VALUES[47] else 1 if not authority else 5
                _diag_finish(1)
                while True: select.select([],[],[],1)  # Unknown inspection/kill/wait keeps live owner.
        raise
    finally:
        for fd in readfds:
            try: os.close(fd)
            except OSError: pass
        if 'trialfd' in locals() and trialfd is not None: os.close(trialfd)


def admission(now, until, phase):
    global reservation_live,quiet_group
    born='native:%d:%d:%d'%(trusted_host['pid'],trusted_host['sec'],trusted_host['usec'])
    if len(born)>64: raise PhaseFailure(145)
    queue = Path(str(LOCK)+'.queue'); clearing = Path(str(LOCK)+'.clearing')
    if clearing.exists(): raise PhaseFailure(146)
    if queue.exists():
        if queue.is_symlink() or not queue.is_dir(): raise PhaseFailure(149)
        scan_primary=None; scan_entered=False
        try:
            _diag_mark(_D_VALUES[1],29)
            with os.scandir(queue) as entries:
                scan_entered=True
                try:
                    if next(entries, None) is not None: raise PhaseFailure(150)
                except BaseException as primary:
                    scan_primary=primary; _diag_capture(primary)
                    raise
        except BaseException as finalizer:
            if scan_entered and (scan_primary is None or finalizer is not scan_primary):
                _diag_finalizer_error(finalizer,28)
            elif scan_primary is None: _diag_capture(finalizer)
            raise
    own=precise(identity(os.getpid()))
    obj = {'pid': trusted_host['pid'], 'started': born, 'group': trusted_host['pid'],
           'name': 'P6 membership '+phase, 'since': datetime.now(timezone.utc).isoformat(), 'cwd': str(OUT)}
    if LOCK.parent.is_symlink() or LOCK.parent.stat().st_uid!=os.getuid(): raise PhaseFailure(147)
    temp = LOCK.parent / ('heavy.lock.p6-membership-'+str(os.getpid()))
    write(temp, obj)
    quiet_group=quiet_pair(now,until)
    os.link(temp, LOCK, follow_symlinks=False)  # Atomic exact existing global authority; no fallback/recovery.
    reservation_live=True
    s = LOCK.stat(); sha = digest(LOCK, 4096)
    write(OUT / (phase+'-reservation.json'), {'lock': str(LOCK), 'dev': s.st_dev, 'ino': s.st_ino,
          'sha256': sha, 'ownerPid': os.getpid(), 'ownerIdentity':own, 'reservationHostIdentity':trusted_host,
          'ownerGroupProof':owner_group,'quietGroupProof':quiet_group,'phase': phase, 'release': False})
    # Never unlink this lock or the owner temp here, including on exception/exit.
    if clearing.exists(): raise PhaseFailure(148)
    if queue.exists():
        scan_primary=None; scan_entered=False
        try:
            _diag_mark(_D_VALUES[1],29)
            with os.scandir(queue) as entries:
                scan_entered=True
                try:
                    if next(entries,None) is not None: raise PhaseFailure(151)
                except BaseException as primary:
                    scan_primary=primary; _diag_capture(primary)
                    raise
        except BaseException as finalizer:
            if scan_entered and (scan_primary is None or finalizer is not scan_primary):
                _diag_finalizer_error(finalizer,28)
            elif scan_primary is None: _diag_capture(finalizer)
            raise


def build(now, until):
    source = NATIVE_SOURCE; obj = str(OUT/'membership.o'); binary = str(OUT/'membership')
    verify(Path(source),65536)
    command([CC,'--no-default-config','-fintegrated-cc1','-fintegrated-as','-fno-crash-diagnostics','-std=c11','-O2','-Wall','-Wextra','-Werror','-arch','arm64',
             '-isysroot',SDK,'-mmacosx-version-min=14.0','-MD','-MF',str(OUT/'headers.d'),
             '-c',source,'-o',obj],until,now,'compile')
    verify(Path(source),65536)
    object_sha=digest(Path(obj),1048576)
    command([LD,'-Z','-L',SDK+'/usr/lib','-L',SDK+'/usr/lib/system','-arch','arm64','-platform_version','macos','14.0','26.5','-syslibroot',SDK,
             '-adhoc_codesign','-t','-o',binary,obj,'-lSystem','-lproc'],until,now,'link')
    if digest(Path(obj),1048576)!=object_sha: raise RuntimeError('link input changed')
    deps = regular(OUT/'headers.d',65536).decode().replace('\\\n',' ').split()[1:]
    if len(deps)>256: raise RuntimeError('header count')
    inventory={}; total=0
    for name in deps:
        if not (name.startswith(SDK+'/') or name.startswith('/Library/Developer/CommandLineTools/usr/lib/clang/') or name==source):
            raise RuntimeError('unapproved header origin')
        raw=regular(Path(name),1048576); total+=len(raw)
        if total>64*1048576: raise RuntimeError('header bytes')
        inventory[name]=hashlib.sha256(raw).hexdigest()
        if reviewed.get(name)!=inventory[name]: raise RuntimeError('actual header not presealed/changed')
    write(OUT/'headers-seal.json', inventory)
    for tool,args,label in [('/usr/bin/otool',['-L',binary],'linked-images'),
                            ('/usr/bin/otool',['-l',binary],'load-commands'),
                            ('/usr/bin/codesign',['--verify','--strict',binary],'signature'),
                            ('/usr/sbin/sysctl',['-n','kern.osversion'],'kernel-build')]:
        command([tool]+args,until,now,label)
    verify_phase_inputs('build',until,now)  # ALL consumed compiler/linker/header/provider bytes, after use.
    write(OUT/'built.json', {'binarySha256':digest(Path(binary),1048576),
          'sourceFamily':'VD14_SUCCESSOR01_B6_R1',
          'roleSourceSha256':role_pins(),
          'objectSha256':digest(Path(obj),1048576),'sourceSha256':digest(Path(source),65536),
          'compilerSha256':digest(Path(CC).resolve(),512*1048576),
          'linkerSha256':digest(Path(LD).resolve(),64*1048576),
          'systemVersionSha256':digest(Path('/System/Library/CoreServices/SystemVersion.plist'),4096),
          'platformTrust':'P3 explicitly trusted Apple platform and sealed CLT; no attestation invented',
          'release':False})


def release(permit, now, until):
    # A DIFFERENT invocation, after trusted host's precise direct-child wait.
    # No guard->true job, no numeric signal, no global process scan.
    phase=permit.get('completedPhase'); release_group=quiet_pair(now,until)
    if phase not in ('build','run') or permit.get('hostObservedCallerExit') is not True or permit.get('hostWaitReturncode') not in (0,70):
        raise PhaseFailure(152)
    reservation=OUT/(phase+'-reservation.json')
    proof=json.loads(regular(reservation,4096))
    observed_path=OUT/(phase+'-host-observed.json')
    raw_observed=regular(observed_path,16384)
    if hashlib.sha256(raw_observed).hexdigest()!=permit.get('hostObservedSha256'):
        raise PhaseFailure(153)
    finish=json.loads(raw_observed)
    for field in ('ownerIdentity','hostWaitReturncode','hostExitLate','classification','retirementReceipts','ownerGroupProof'):
        if finish.get(field)!=permit.get(field): raise PhaseFailure(167)
    failed_qualification=finish.get('classification')=='FAILED_QUALIFICATION_COHORT_RETIRED'
    if not failed_qualification:
        expected='QUALIFIED_BUILD' if phase=='build' else 'OBSERVED_ONLY_FOR_REQUESTED_PIDS'
        if finish.get('classification')!=expected or permit['hostWaitReturncode']!=0 or finish.get('hostExitLate') is not False:
            raise PhaseFailure(168)
    managed_file=phase+('-finished.json' if permit['hostWaitReturncode']==0 else '-failed-retired.json')
    if digest(OUT/managed_file,16384)!=finish.get('managedFinishSha256'):
        raise PhaseFailure(154)
    if proof.get('reservationHostIdentity')!=trusted_host: raise PhaseFailure(155)
    if proof.get('ownerGroupProof')!=owner_group or finish.get('ownerGroupProof')!=owner_group:
        raise PhaseFailure(196)
    retained_pair(proof.get('quietGroupProof'),proof['ownerIdentity'])
    if permit.get('ownerIdentity')!=proof['ownerIdentity'] or finish.get('ownerIdentity')!=proof['ownerIdentity']:
        raise PhaseFailure(156)
    for name,expected in permit.get('retirementReceipts',{}).items():
        if '/' in name or not name.endswith('.json'): raise PhaseFailure(169)
        raw=regular(OUT/name,65536)
        if hashlib.sha256(raw).hexdigest()!=expected: raise PhaseFailure(170)
    required=finish.get('retirementReceipts')
    if not required or required!=permit.get('retirementReceipts'): raise PhaseFailure(157)
    inv=finish.get('commandInventory')
    plan=PLANS[phase]
    if not isinstance(inv,list) or not inv or (inv!=plan if not failed_qualification else inv!=plan[:len(inv)]):
        raise PhaseFailure(158)
    if len(required)!=len(inv): raise PhaseFailure(159)
    labels=[]
    for name in required:
        row=json.loads(regular(OUT/name,65536))
        labels.append(row.get('commandLabel'))
        if (row.get('exactChildExit') is not True or row.get('scopeEmptyWhileAnchorRetained') is not True or
            row.get('ownerGroupProof')!=owner_group):
            raise PhaseFailure(171)
    if sorted(labels)!=sorted(inv): raise PhaseFailure(160)
    if permit.get('reservationSha256')!=digest(reservation,4096): raise PhaseFailure(161)
    quiet_pair(now,until)
    if memory(os.getpid())>LIMIT or now()>=until: raise PhaseFailure(162)
    # Atomically publish a PREPOPULATED clearing gate. Existing clearDead's
    # stale rmdir cannot remove a NONEMPTY gate, even across an OS stall.
    staging=LOCK.parent/('heavy.lock.p6-release-'+str(os.getpid()))
    staging.mkdir(mode=0o700)
    write(staging/'owner.json',{'releaseIdentity':precise(identity(os.getpid())),'oldOwnerIdentity':proof['ownerIdentity'],
          'ownerGroupProof':owner_group})
    gate=Path(str(LOCK)+'.clearing')
    lib.renameatx_np.argtypes=[C.c_int,C.c_char_p,C.c_int,C.c_char_p,C.c_uint]
    lib.renameatx_np.restype=C.c_int
    if lib.renameatx_np(-2,os.fsencode(staging),-2,os.fsencode(gate),4):
        raise PhaseFailure(163)
    # From here any uncertainty leaves the nonempty gate intact and held.
    before=LOCK.stat()
    if (before.st_dev,before.st_ino,digest(LOCK,4096))!=(proof['dev'],proof['ino'],proof['sha256']):
        raise PhaseFailure(164)
    if now()>=until: raise PhaseFailure(165)
    gate_stat=gate.stat()
    write(OUT/(phase+'-release-prepared.json'),{'state':'PREPARED_CANONICAL_LOCK_STILL_HELD',
          'completedPhase':phase,'classification':finish['classification'],'oldOwnerIdentity':proof['ownerIdentity'],
          'releaseIdentity':precise(identity(os.getpid())),'lockDev':proof['dev'],'lockIno':proof['ino'],
          'lockSha256':proof['sha256'],'reservationSha256':permit['reservationSha256'],
          'hostObservedSha256':permit['hostObservedSha256'],
          'reservationHostIdentity':proof['reservationHostIdentity'],'ownerGroupProof':owner_group,
          'releaseGroupProof':release_group,
          'gateDev':gate_stat.st_dev,'gateIno':gate_stat.st_ino,
          'operatorDeadlineNs':str(until),'release':False})
    if now()>=until: raise PhaseFailure(166)

    return 0


def verify_phase_inputs(phase,until,now):
    if len(reviewed)>4096: raise PhaseFailure(910)
    names=[name for name in reviewed if phase=='build' or
        name.startswith('/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/') or
        name in (str(BASE/'native-membership-caller.py'),str(BASE/'native-membership-host-finalize.py'),
                 '/bin/ps','/System/Library/CoreServices/SystemVersion.plist')]
    maximum=(640 if phase=='build' else 64)*1048576; total=0
    for name in names:
        total+=Path(name).resolve().stat().st_size
        if total>maximum or now()>=until: raise PhaseFailure(911)
        verify(Path(name),512*1048576)
        if now()>=until: raise PhaseFailure(912)


def qualify_startup(proof_text):
    """Startup and quiet native pair only; no admission, tools or children."""
    global trusted_host
    if len(proof_text.encode())>2048: raise PhaseFailure(195)
    report = initialize(qualification=True)
    now=initialize(); started=now(); trusted_host=precise(identity(os.getppid()))
    bind_group(json.loads(proof_text)); pair=quiet_pair(now,started+60_000_000_000)
    report.update(version=1, kind='CALLER_STARTUP_PROFILE', identity=precise(identity(os.getpid())), pid=os.getpid(),
                  parentPid=os.getppid(), passed=True, memorySamples=[memory(os.getpid())],
                  ownerGroupProof=owner_group,quietGroupProof=pair)
    raw = (json.dumps(report, sort_keys=True) + '\n').encode()
    if len(raw) > 2048: raise RuntimeError('qualification metadata bound')
    report['memorySamples'].append(memory(os.getpid()))
    if max(report['memorySamples']) > LIMIT: raise RuntimeError('qualification caller memory bound')
    raw = (json.dumps(report, sort_keys=True) + '\n').encode()
    if len(raw) > 2048 or os.write(1, raw) != len(raw):
        raise RuntimeError('qualification metadata publication')
    return 0


def main(argv):
    if len(argv)==3 and argv[1]=='qualify-startup': return qualify_startup(argv[2])
    global reviewed, phase_name, trusted_host
    now=initialize(); entry=now(); os.umask(0o077)
    if len(argv)!=3 or argv[1] not in ('build','run','release'): raise PhaseFailure(172)
    phase=argv[1]; phase_name=phase; permit=json.loads(regular(Path(argv[2]),16384,private=True))
    trusted_host=permit.get('trustedHostIdentity')
    if not isinstance(trusted_host,dict) or precise(identity(os.getppid()))!=trusted_host: raise PhaseFailure(173)
    allocation_t0=permit.get('allocationT0Ns')
    if not isinstance(allocation_t0,str) or not allocation_t0.isascii() or not allocation_t0.isdecimal() or not 1<=len(allocation_t0)<=24: raise PhaseFailure(174)
    entry=int(allocation_t0)
    if entry>now(): raise PhaseFailure(175)
    bind_group(permit.get('ownerGroupProof'))
    reviewed=permit.get('reviewedInputs',{})
    if not isinstance(reviewed,dict) or not reviewed: raise PhaseFailure(176)
    verify(Path(__file__),65536)
    manifest=BASE/'native-provider-files.sha256'
    if digest(manifest,1048576)!=permit.get('providerManifestSha256'): raise PhaseFailure(177)
    for line in regular(manifest,1048576).decode().splitlines():
        expected,name=line.split('  ',1)
        if len(expected)!=64 or not name.startswith('/'): raise PhaseFailure(184)
        if name in reviewed and reviewed[name]!=expected: raise PhaseFailure(185)
        reviewed[name]=expected
    links=json.loads(regular(BASE/'native-provider-links.json',16384))
    if digest(BASE/'native-provider-links.json',16384)!=permit.get('providerLinksSha256'): raise PhaseFailure(178)
    for name,target in links.items():
        if str(Path(name).readlink())!=target: raise PhaseFailure(186)
    if permit.get('status')!='EXPLICITLY_ALLOCATED' or permit.get('phase')!=phase or permit.get('platformTrustAccepted') is not True:
        raise PhaseFailure(179)
    if phase!='release':
        qualification = regular(Path('/tmp/p6-membership-vd14-Q01-reviewed.json'),16384,private=True)
        if hashlib.sha256(qualification).hexdigest()!=permit.get('startupQualificationEvidenceSha256'):
            raise PhaseFailure(187)
        verify_phase_inputs(phase,entry+60_000_000_000,now)
    if phase=='release':
        if permit.get('completedPhase') not in ('build','run'): raise PhaseFailure(188)
        _diag_reserve('release-'+permit['completedPhase'],entry+2_000_000_000)
        _diag_mark(10,13)
        return release(permit,now,entry+2_000_000_000)
    if permit.get('toolNoDetachTrustAccepted') is not True: raise PhaseFailure(180)
    if phase=='build': OUT.mkdir(mode=0o700)
    else:
        built=json.loads(regular(OUT/'built.json',4096))
        if digest(OUT/'built.json',4096)!=permit.get('buildResultSha256'): raise PhaseFailure(200)
        if built.get('sourceFamily')!='VD14_SUCCESSOR01_B6_R1' or built.get('roleSourceSha256')!=role_pins(): raise PhaseFailure(200)
        if built.get('sourceSha256')!=reviewed.get(NATIVE_SOURCE): raise PhaseFailure(200)
        build_observed=regular(OUT/'build-host-observed.json',16384)
        if hashlib.sha256(build_observed).hexdigest()!=permit.get('buildHostObservedSha256'):
            raise PhaseFailure(189)
        build_status=json.loads(build_observed)
        bind_group(build_status.get('ownerGroupProof'),False)
        released=json.loads(regular(OUT/'build-released.json',4096,private=True))
        if (digest(OUT/'build-released.json',4096)!=permit.get('buildReleasedSha256') or
            released.get('ownerGroupProof')!=build_status['ownerGroupProof'] or
            released.get('oldOwnerIdentity')!=build_status.get('ownerIdentity') or
            released.get('hostObservedSha256')!=permit['buildHostObservedSha256'] or
            released.get('resourceReleaseOnly') is not True or type(released.get('actualReleaseReturncode')) is not int or
            released['actualReleaseReturncode']!=0 or released.get('classification')!='QUALIFIED_BUILD' or
            build_status.get('commandInventory')!=PLANS['build']): raise PhaseFailure(200)
        if build_status.get('classification')!='QUALIFIED_BUILD' or build_status.get('hostWaitReturncode')!=0 or build_status.get('hostExitLate') is not False:
            raise PhaseFailure(190)
        reviewed[str((OUT/'membership').resolve())]=permit.get('binarySha256')
        if permit.get('binarySha256')!=built['binarySha256'] or digest(OUT/'membership',1048576)!=built['binarySha256']:
            raise PhaseFailure(191)
    # B includes caller preflight/admission/build/receipts; R setup is separately costed60s.
    until=entry+60_000_000_000
    _diag_reserve(phase,until)
    _diag_mark(1,13)
    admission(now,until,phase)
    if phase=='build': build(now,until)
    else:
        trial_t0=now()
        if trial_t0>=until: raise PhaseFailure(192)
        trial_end=trial_t0+2_000_000_000
        until=trial_end  # ALL validation/digests/final receipts stay inside R operator deadline.
        write(OUT/'trial-invocation.json',{'operatorT0Ns':str(trial_t0),'operatorDeadlineNs':str(trial_end),'release':False})
        command([str(OUT/'membership'),'--supervise',str(OUT/'membership')],trial_end,now,'trial',4096,True)
        result=json.loads(regular(OUT/'trial-receipt.json',4096))
        if type(result.get('peakSampleBytes')) is not int or not 0<result['peakSampleBytes']<=LIMIT-_D_CHARGE:
            raise PhaseFailure(193)
        if result.get('outcome')!='OBSERVED_ONLY_FOR_REQUESTED_PIDS' or result.get('exactExit') is not True:
            raise PhaseFailure(194)
    if phase=='run': verify_phase_inputs(phase,until,now)
    if now()>=until: raise PhaseFailure(181)
    if launched_labels!=PLANS[phase]: raise PhaseFailure(182)
    retired={lease['receipt']:digest(OUT/lease['receipt'],65536) for lease in ownership.values()}
    write(OUT/(phase+'-finished.json'), {'state':'CHILD_WORK_FINISHED_NOT_CALLER_EXIT',
          'ownerIdentity':precise(identity(os.getpid())),'phase':phase,'atNs':str(now()),
          'operatorT0Ns':str(trial_t0 if phase=='run' else entry),'operatorDeadlineNs':str(until),
          'idleMemorySamples':_IDLE_MEMORY_SAMPLES,'idleMemoryPeakBytes':_IDLE_MEMORY_PEAK,'diagnosticGrowthChargeBytes':_D_CHARGE,
          'commandInventory':launched_labels,'retirementReceipts':retired,'ownerGroupProof':owner_group,'release':False})
    idle_memory_checkpoint()
    if now()>=until: raise PhaseFailure(183)
    return 0


if __name__=='__main__':
    try: sys.exit(main(sys.argv))
    except Exception as error:
        _diag_capture(error)
        try: os.write(2,b'PHASE_FAILURE_CAPTURED\n' if _D_READY else b'PRE_DIAGNOSTIC_INITIALISATION_FAILURE\n')
        except BaseException: pass
        if reservation_live:
            if unresolved_births or not ownership or not all(lease['reaped'] for lease in ownership.values()):
                _diag_finish(1)
                while True: select.select([],[],[],1)
            try:
                if launched_labels!=PLANS[phase_name][:len(launched_labels)]: raise RuntimeError('failed prefix inventory mismatch')
                retired={lease['receipt']:digest(OUT/lease['receipt'],65536) for lease in ownership.values()}
                write(OUT/(phase_name+'-failed-retired.json'),{'state':'FAILED_QUALIFICATION_COHORT_RETIRED',
                    'ownerIdentity':precise(identity(os.getpid())),'idleMemorySamples':_IDLE_MEMORY_SAMPLES,
                    'idleMemoryPeakBytes':_IDLE_MEMORY_PEAK,'diagnosticGrowthChargeBytes':_D_CHARGE,
                    'commandInventory':launched_labels,'retirementReceipts':retired,'ownerGroupProof':owner_group,'release':False})
            except BaseException as cleanup_error:
                _diag_cleanup_error(cleanup_error)
                _D_VALUES[46]=4; _diag_finish(1)
                while True: select.select([],[],[],1)
        _diag_finish(0)
        sys.exit(70)
    finally:
        for fd in _D_FDS:
            try: os.close(fd)
            except OSError: pass
