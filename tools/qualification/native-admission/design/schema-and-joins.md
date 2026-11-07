# Proof, reader and receipt contracts

All JSON is ordinary UTF-8 with the existing sorted-key/newline writer. Existing
top-level phase/release records retain their original fields and readers; new
closed proof dictionaries are separate from precise historical identities.
No UID/SID key is inserted into trustedHostIdentity or any pid/sec/usec triple.
The original permit reader is bounded but not a new all-fields-closed schema;
the exact later reviewed allocation supplies its permitted input keys.

## Closed owner proof

ownerGroupProof has exactly version, ownerIdentity, uid, sid, pgid,
singletonMembers, singletonObservedNs and premise. Version is exact integer1.
ownerIdentity has exactly integer pid/sec/usec. Its matching singletonMembers
list has one row with exactly integer pid/ppid/uid/pgid/sid/sec/usec. PID is
2..INT32_MAX, parent1..INT32_MAX, UID0..UINT32_MAX, seconds0..UINT64_MAX and
microseconds0..999999. SID=PGID=PID. Boolean substitutes fail exact type tests.
The decimal ASCII timestamp has 1..24 characters. The exact premise literal
is COMPLETE_BOUNDED_GROUP_NOT_CONSUMER_TABLE. Sorted JSON plus newline is at
most2048 bytes, inside the unchanged16KiB permit and4KiB reservation readers.

The owner supplies proof from native self observations and complete singleton
censuses; a caller's supplied dictionary is never a substitute for its own
native revalidation. The owner row includes parentage conservatively, so owner
reparenting also refuses. Native UID is the actual Mac principal. Synthetic501
fixtures do not set or certify it. Complete native enumeration remains a
qualified platform premise, rather than a claim that a successful partial
table can be recognised from its count alone.

quietGroupProof and releaseGroupProof each have exactly observedNs and members.
The timestamp uses the same decimal bound; members contains precisely the two
distinct owner/caller rows. Every row uses the closed native row shape. Owner
row equals the original singleton row. Caller has the same UID/SID/PGID, direct
parent ownerPID and its separately recorded birth. Completed pair observation
must follow original singleton observation. Live quiet_pair brackets both rows
and exact membership; retained_pair/_pair_shape validate already retained
data, without querying an old or reaped incarnation.

## New joins through one phase/release cycle

| Artifact or reader | Exact new evidence/join |
|---|---|
| Owner-created phase/release permit | Original allocationT0Ns and trustedHostIdentity plus original ownerGroupProof; owner proves singleton again before direct Popen, without setsid in that child. |
| First canonical lock bytes | Existing pid/started/group/name/since/cwd shape; pid=group=ownerPID and started=native:PID:seconds:microseconds. No group0 publication or ticket. |
| Phase reservation | Original lock path/dev/ino/hash and actual phase caller identity, original reservationHostIdentity, ownerGroupProof and quietGroupProof. The existing4KiB release reader remains. |
| Each normal/cleanup command receipt | Original exact tool identity, real exit/anchor census and output evidence plus original ownerGroupProof. Each launched label still requires its real receipt. |
| Phase finished/failed-retired | Same actual caller identity, deadlines, memory/diagnostic charge, ordered inventory and receipt hashes, plus original ownerGroupProof. Empty ownership stays UNKNOWN_HELD. |
| Host observed phase | Same actual raw wait/status classification, finish hash, inventory/receipt hashes, plus ownerGroupProof and ownerGroupCompletedNs. Any lateness through the added post-wait singleton observations marks failed qualification. hostExitObservedNs remains the original actual wait observation. |
| Separate release caller | Original phase reservation, host-observed hash, finish hash and exact nonempty full/prefix label/receipt joins; retained phase quiet pair and original proof; a newly observed live release pair. |
| Nonempty clearing gate owner.json | Original release and old phase-caller identities plus original ownerGroupProof; no caller unlink of canonical lock. |
| Release-prepared | Original canonical/gate inode/hash, phase/reservation/deadline/release identity plus ownerGroupProof, releaseGroupProof and original hostObservedSha256. |
| Owner finalisation | Retained real release Popen/argv, proof and pair joins, actual raw wait, unchanged prepared bytes, fresh singleton, gate proof and exact lock identity before owner-only unlink/exclusive gate retirement. |
| Released receipt | Original actual release wait/classification/timing and resourceReleaseOnly plus ownerGroupProof and exact hostObservedSha256. |
| Owner stdout | Original external-owner-terminal limitation and resource/classification fields plus ownerGroupProof. It does not certify its own eventual exit. |

Unknown/failed scopes keep original primary diagnostics and retained handles.
The fixed emergency buffers do not JSON-encode the proof; no new emergency
record, field, FD or publisher is added. Existing pre-diagnostic and unknown
markers retain their limited meanings. Diagnostic code additions are mapped
separately; original codes and first-cause/authority ordering remain visible.

## Fresh startup route

The owner entry still takes qualify-startup --input ABSOLUTE_BUNDLE. It
establishes/validates its private singleton before any Q caller. The inner
exact caller argv now appends one compact owner-proof JSON string, bounded2048
bytes. This changes neither the empty initial exec environment nor its distinct
post-import profile. The Q caller initialises the native APIs, validates proof,
observes the quiet direct pair and reports both proofs beside its original
profile/identity/two memory samples. It forks no child and enters no admission.

The owner captures the unchanged2048/1024 stdout/stderr bounds, consumes the
actual direct wait, validates exact Q caller dictionary/flags/environment and
pair joins, and rechecks singleton after exit. Q output and the reviewed-Q
consumer bind the new role hashes, no-follow paths, exact extended inner argv,
original owner identity/proof, raw caller hash, pair and singleton/exit time
order. The new fixed reviewed path is /tmp/p6-membership-vd14-Q01-reviewed.json.
No old Q03/Q04 record or copied C04 seal can satisfy the new role/path/proof
contract. External root Q owner exit/capture disposition remains required.

## B to separately allocated R

All actual compile/link/tool/header provenance is retained. built.json now
records sourceFamily=VD14_SUCCESSOR01_B6_R1 and the exact two reviewed role
source hashes. New R input pins buildResultSha256 and buildReleasedSha256,
in addition to original buildHostObservedSha256/binarySha256. The R setup
reader binds those actual files, the current role pair and unchanged native C
source digest; original qualified/not-late/exit0 build checks remain.

Historical B's owner proof is checked as data only (bind_group current=False),
never adopted as live authority or substituted for the fresh R owner. Its B6
inventory, phase-caller identity, proof, observed hash, successful actual release
and resourceReleaseOnly receipt must join. Root still supplies the accepted B
and external owner terminal judgment before allocating R. These extra joins
do not create an automatic B→R path or turn an owner's own receipt into its
terminal proof. No artifact is produced by this source packet.
