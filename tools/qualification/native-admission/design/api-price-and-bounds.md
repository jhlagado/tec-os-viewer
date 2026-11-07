# API, bounds and price readback

SOURCE PRICE ONLY. No import, syntax check, fixture/model/control execution,
native API probe, build or runtime measurement was performed. Source/API and
price judgments belong to the independent reviewer and root. Actual Mac
provider/ABI/permission/clock/consumer behavior remains unqualified.

## API binding

The owner reuses ctypes, struct and os already imported by C04. The caller
adds no imports. Both bind libproc proc_pidinfo(int,int,uint64,void*,int)->int
and proc_listpgrppids(int,void*,int)->int. C04 BSD remains136 bytes. Selected
offsets are status4, pid12, ppid16, uid20, pgid100, birth seconds120 and
microseconds128. Caller accesses the existing named BSD fields; owner uses
explicit little-endian unpacking. Both require exact136-byte return, errno0,
matching PID, live-not-zombie owner/caller, microseconds<1,000,000 and unchanged
before/after row. The new UID read is uint32, not the unrelated signed nice
field. Existing identity()/precise() shapes are unchanged.

Flavor3/argument1 includes retained zombies in the original API convention;
new live group rows reject status5. No denied detail becomes a substitute
identity. Caller operations30/31 bind libSystem getsid/getpgid(int)->int,
clear/check errno and require positive>=2 return. Owner uses Python3.9 os
getsid/getpgid/getpgrp/setsid wrappers and their OSError behavior. setsid occurs
at most once in the existing eligible owner, never a fallback child; a group
leader that cannot establish its session refuses. Existing child tool setsid
and cleanup getsid semantics remain.

The group convenience wrapper returns PID counts, not proc_listpids byte
counts. Storage is128 C ints=512 bytes. Negative/error/full128 and invalid or
duplicate IDs refuse. Singleton requires exactly ownerPID in both lists;
quiet pair requires exactly owner/caller in both lists. No all-process BSD
scan, session-pointer interpretation, permissive UID fallback or global
process-table parser is added. Complete bounded enumeration and same-principal
access remain platform premises; repeated successful partial results cannot
be detected by counting alone.

Exact historical SDK header pins are extracted as inert data from the unchanged
9319c33b provider manifest and listed in reference-bindings.json. The existing
permission-membership proposal, held-operator source offer and snapshot-layout
review record the original SDK/wrapper/layout readings. Current published
Apple wrapper semantics and a historical SDK declaration do not attest the
deployed Mac kernel or its policy. None of these headers/libraries is reported
as installed or reverified on Linux. The actual supported Mac must reverify
the original regular provider files/links and qualify these exact APIs.

All other C04 filesystem, memory, clock, signal, waitid/waitpid, child/session,
renameatx_np and build APIs are inherited. Fixed diagnostic encoding and its
first/finalizer/ACK paths add no group calls or arbitrary JSON in emergency
publication. New normal errors use fixed reasons195–200 and operations30/31;
native failed return/errno and successful invalid payload remain distinct.
Owner-side group native errors retain bounded PID/return/errno/count context
in its existing external exception capture, not a fabricated caller record.

## Sources, payloads and descriptors

| Item | Price/limit |
|---|---:|
| Caller source |65,450 bytes, +6,921 from C04 |
| Owner source |49,594 bytes, +9,368 from C04 |
| Unchanged source-reader bound |65,536 bytes; caller has86 bytes remaining |
| Native C reference |13,251 bytes, byte-exact2bc77004 |
| Closed owner-proof maximum canonical JSON payload |429 bytes, below explicit2048 ceiling |
| Closed two-member quiet-proof maximum JSON payload |344 bytes |
| Declared maximum Q caller report |1431 bytes, within unchanged2048 capture |
| Declared maximum-width phase reservation |1232 bytes, within unchanged4096 reader |
| Inactive planned phase/release permit sizing |2662/3932 bytes, within unchanged16384 reader |
| Declared maximum-width prepared/released shapes |1672/990 bytes, within16384/4096 readers |
| New persistent FDs or new diagnostic/artifact names |0 |
| Existing diagnostic buffers/FDs/names |16640 bytes /3 /4 |
| Existing logical growth reserve |1048576 bytes inside700MiB, unchanged |

bounded-data-account.json retains the actual inert dictionaries and serialized
lengths, not an executed source predicate. The proof/pair maxima follow their
closed scalar/key/list domains; permit/receipt sizing uses the declared planned
fields, not a claim that arbitrary bounded input records always fit a smaller
size. Runtime readers/writers still refuse overflow rather than extending a
limit. No future source saving is credited; any correction must still fit64KiB.

Group accessors use one136-byte native row at a time; owner's .raw unpack can
also have a136-byte copy live, giving272 native/copy payload bytes there.
Membership calls use one512-byte array at a time and at most127 accepted PID
slots before equality rejects an unexpected group. Normal pair bracketing can
retain four row dictionaries (two before/two after) alongside the original
proof/row and bounded identity/set/list/string temporaries. Proof JSON normal
serialization can hold bounded text and UTF-8 copies; Q additionally retains
its compact proof argv and existing bounded captures. Receipt joins may retain
the original and decoded/hash-read copies under their old file-reader bounds.

Python dictionary/int/path/frame/ctypes/library/header/allocator overhead,
source compilation workspace and RSS highwater are not measured or proved by
payload sums. These objects are charged by the original actual self/lifetime/
footprint samplers and conservative1MiB logical growth allowance inside700MiB;
the allowance is not increased or claimed allocation-free. An actual sampled
over-limit result refuses. Frozen native C does not enforce the caller's logical
reserve live; its reported aggregate peak plus that reserve is still checked
before caller acceptance. No instantaneous or physical-cutoff claim follows.

No FD is added for group queries/proof data. Existing ordinary reader/writer
FDs, Q pipes, tool pipes and optional trial FD retain their original lifetimes
and closerange handling. Proof fields enlarge existing records only. Same
64-entry/1MiB-file/3MiB-directory quotas and full diagnostic4-name/32768-byte
reservation remain. Removing the two self-start launches removes their actual
artifacts from the new plans; no measured time/memory saving is claimed.

## Query and deadline costs

A group_row/_owner_row bracket costs two BSD calls and one SID/one PGID call.
Owner continuity additionally obtains self PID; caller continuity obtains
PPID and its own SID/PGID. There is no hidden process or child query actor.
One owner singleton costs two row brackets and two group-list calls, plus its
explicit self-PID getters; with normal code paths this is13 process metadata
calls and up to two deadline clock reads. Owner establishment adds two row
brackets, initial PID/UID getters and at most one setsid, all before any caller.

One caller quiet pair costs its continuity bracket, two group lists, four
row brackets and bounded self PID/PPID/session/group getters: at most28 process
metadata calls and three clock reads on its complete normal path. Failed
short-circuit paths stop earlier. Native error capture adds no syscall. Each
caller cohort adds two continuity checks before its final original deadline
test. Each caller idle and owner memory checkpoint also adds continuity;
those costs multiply by the existing bounded hash/poll/cohort/Q loops, not a
new polling budget. Native calls can block. Their execution cost and permission
outcomes remain unmeasured and must be priced by the exact future offer.

All new work consumes the original phase origins: B60s, R setup60s, R2s with
unchanged150ms native window, separate preauthorised release2s, wait0 and700MiB.
No new actor, timer, deadline reset or reserve is added. Completed owner-group
checks after actual phase wait can turn an otherwise timely exit into failed
qualification. Existing late/UNKNOWN held-tail paths can remain alive awaiting
actual waits or separate disposition; they are neither a new qualifying window
nor a promise of finite physical shutdown. Bootstrap/import and final external
terminal tails retain their original unmeasured limits.

## Required later review and controls

The25 declarations are inert review data. They include actual-native positive/
negative and real-consumer requirements that a data reader cannot establish.
No API fault injector or control runner has been implemented or executed.
Intentional hold cases require a separate finite containment/ending plan.
Native positive B and failing provenance/retirement pair are still unshown,
so A5 remains unregistered. The unchanged consumer's successful partial-table
failure mode stays explicit. Source clearance alone permits no command, live
permit, canonical lock operation, build, R or criterion acceptance.
