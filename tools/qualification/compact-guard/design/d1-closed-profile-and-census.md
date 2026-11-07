# Concrete D1 execution profile and census prerequisites

Source preparation only, following the conditional design pass. No classifier
implementation, runtime, new allocation or attempt03. The current sealed
executables do not implement this profile. Missing conformance remains
UNKNOWN_HELD, not permission to exclude an outside PID.

## Frozen execution profile

The profile identity is the digest of a complete canonical record: executable
and script bytes, exact role argv, complete environment, import/native-loader
closure, case inputs, and allowed process transitions. It is independently
reviewed evidence plus runtime conformance, not a caller's boolean.

**Python interpreter candidate:**
`/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9`,
102,352bytes, SHA-256
`bdea59019a38eb6600cc9e71e984a97fedadc406448431281e7657030f54987e`.
The adjacent framework Python3 image is5,864,880bytes, SHA-256
`26422f0b21cb1e07236384afa4043c7401d39d09358c91df8bf3f5496f14712f`.
These are filesystem observations, not execution, loaded-image proof or a
version probe. Do not use the /usr/bin launcher as an interchangeable identity.

Every Python role starts with the same sealed interpreter and `-I -S` BEFORE
the absolute approved script path. This applies to root, inspection children,
bootstrap, and any exec replacement; a shebang without these flags is not
equivalent. [Python3.9's primary command-line documentation](https://docs.python.org/3.9/using/cmdline.html)
defines isolated mode and disabling site startup separately. They remove
important injection paths but do not alone prove the import closure.

The initial external caller must construct the environment before first
Python startup. A scrub inside an already initialized root is too late. The
complete base dictionary is specified below; no other keys are inherited:

| Key | Exact value rule |
| --- | --- |
| HOME | Exclusive run's private home directory |
| TMPDIR | Exclusive run's private temporary directory, terminal slash |
| LANG, LC_ALL | C |
| TZ | UTC |
| PATH | /usr/bin:/bin; no target executable may rely on PATH lookup |

Role additions are narrowly typed: guard-entry may set only the prepared
P6_PROTOTYPE_TEST_AUTHORITY path/digest pair; bootstrap/worker receive only
the signed P6_REGISTERED_LEASE/P6_REGISTERED_RUN pair and guard-generated
ORIGO_GUARD. NODE_OPTIONS is absent on entry roles and exactly
`--max-old-space-size=525` on the guarded worker lineage. No inherited options
are appended. No PYTHON*, DYLD_*, NODE_PATH, loader/preload, OpenSSL config,
compile-cache or unrelated certificate/module configuration survives by default.
Unknown keys or a different value refuse the profile. This is an allowlist,
not an incomplete blacklist. Run-local paths/IDs are bound in the prepared
record; HOME/CWD contents are not allowed to supply executable modules.

**Node candidate:** the existing pinned24.18.0 absolute executable and
SHA-25672c18e2eeda260f67a5b2b66e96fa9b5ad82864676ebb54925695d87120cae3f.
Only an absolute sealed `.mjs` entry and its declared data arguments are
permitted. No eval, stdin program, preload, import loader, inspector,
configuration-file or alternative entry argument is accepted. Guard-entry's
existing explicit argv replacement must itself match the role record.
[Node24.18.0's primary CLI specification](https://raw.githubusercontent.com/nodejs/node/v24.18.0/doc/api/cli.md)
is the source for option/environment behavior. Builtin `node:` imports are
bound to the binary; relative imports resolve only to the sealed local graph.

Private HOME must never select reservation authority. The proposed D1 guard
role explicitly binds argv `--lock /Users/johnhardy/.origo/heavy.lock` to the
existing machine-wide lock, with queue
`/Users/johnhardy/.origo/heavy.lock.queue` and tickets beneath that same queue.
No run-local lock, HOME-relative fallback or independent private queue is
allowed. The caller must verify this canonical existing global namespace
before admission; uncertain identity refuses. This is a profile requirement
only: existing commands and executable sources are unchanged. Atomic
noncontended admission must preserve cross-study exclusion at this exact
authority, including the existing queue, rather than merely checking absence.

The separate capability candidate uses the direct framework application
executable `Resources/Python.app/Contents/MacOS/Python` (101,280bytes, SHA-256
`0b7aad9bf1adf74d3922cf351f7d2e908dae19edd5456299d162810ae083523d`).
Neither that candidate nor the bin/python3.9 candidate above has been run here;
loaded-image and startup-dependency qualification remain prerequisites.

## Import binding and concrete integration obligations

The Python stdlib roots are the canonical framework3.9 `lib/python3.9` and
`lib-dynload`, plus the exact interpreter's built-in/frozen modules. Seal the
actual transitive .py/.pyc/native extension files and their loader dependencies;
record absent/unused zip roots and reject newly appearing code there. No
site-packages, user-site, .pth, sitecustomize, usercustomize or CWD import is
admitted. Compare observed origins and native image identities with this record
before granting an outside-exclusion certificate. A post-import inventory
cannot undo unapproved startup code; the launch and filesystem trust boundary
must already constrain those imports.

Under -I, current `from oracle import ...` will not resolve from the script
directory. A future change must explicitly load ONLY the sealed oracle.py by
approved absolute path/bytes and fixed module identity, before its use; it must
not append CWD or restore unrestricted sys.path. The current shebang-based
`observed()` and adapter inspection launches need a sealed interpreter plus
exact argv prefix, consistently, rather than treating a script as a native
binary. Bootstrap and acknowledgement-check exec replacements need explicit
role environments rather than inherited execv state. None is changed here.

The Node local graph is root's run.mjs, harness-lib.mjs, peer.mjs,
guard-entry.mjs, lease-adapter.mjs, copied guard, ack-check.mjs and fixture.mjs.
The D1 case/variant/config inputs are immutable and select only the busy-loop
branch; browser/Playwright and other fixture branches are outside this proof.
Do not generalize D1 evidence to the other19 paths.

There is also a reachable external-tool branch: copied guard acquire/ahead/
holds/guardAlive/started can invoke spawnSync('ps') before wait0 refusal.
freePercent is disabled in registered mode and tree/footprint remain legacy
accounting, but that does not remove lock inspection. The minimal proposed D1
boundary is strict, noncontended admission before legacy queue/holder probing:
an existing lock/ticket or uncertain admission refuses, with no stale-holder
recovery or ps invocation. Admission must still be atomic; a prior absence
check is not sufficient. Default/shared behavior and other cases do not change.
Binding ps as another approved executable would require a separate closure
argument and is not the selected profile. No admission code is implemented.

## Allowed process-transition graph

| Edge | Required before its permitted work |
| --- | --- |
| External caller → Python root | Exact interpreter/-I/-S/script/env/import boundary before startup; common T0 and external ownership |
| Root → broker / terminal observer | Direct fork lease; both retain sealed Python state; observer exists only in the declared terminal phase |
| Broker → publication/verifier helper | Recorded direct child, no new SID; non-forking approved action; verifier exec uses exact Node profile |
| Broker → anchor → worker | Child stop before setsid; planned SID and anchor retained unreaped; dual durable transition acknowledgement before worker exec |
| Worker → run/peer/guard-entry | Exact Node entry/env; one initial trusted bootstrap allowance, then consumed |
| Guard → Python bootstrap → Node fixture | Detached=false; explicit Python prefix/env; positive stopped identity and dual acknowledgement before sealed target exec |
| Node peer/adapter/harness → identity inspector | Detached=false; exact Python prefix/root.py identity mode; no fork or session change in inspector |
| D1 fixture after activation | Marker then busy loop; no child/session transition; no alternative mode or mutable branch input |

All pending direct forks are accounted for before a census can complete.
Broker serialization alone does not freeze children; independently executing
inspection children still need inherited-SID closure and census handling.
If an environment/import/native component can execute an unregistered setsid,
double fork or replacement outside this graph, the proof fails. Source seals
alone do not establish that the actual program used these launch profiles.

The census certificate must include a population-generation vector H for ALL
approved spawners, not just broker E: external root, broker, run harness,
registered guard, supervisor and watchdog. Each must mark a pending fork intent
before creation, then bind its child PID/precise birth and role, or retain an
unresolved slot. Current numeric pending sets are not that ledger. Child exit
must be reconciled through the actual parent's observation; closed output
streams or a timeout do not establish exit. A timeout remains a candidate with
its inherited SID and unresolved ownership. Missing owner acknowledgements
refuse the census.

For broker-owned helpers specifically, current fork precedes helpers.add and
the child may exec immediately. The proposed exclusion barrier begins BEFORE
that fork and ends only after parent ownership/identity registration or a
positively observed/reconciled exit. No outside certificate may cover the
pending interval. Trusted helper instructions must stay non-forking in the
inherited scope. This is a required future integration with existing ownership
records, not a claim that current code already has the barrier.

Root-to-broker and root-to-observer transitions need the same phase rule.
There is no census while their identities are unbound. After broker termination
the observer must receive the last acknowledged E/H and unresolved ledger,
force itself/root and all surviving/uncertain ownership into accounting, and
refuse if the handoff is incomplete. Broker exit does not remove unresolved
helper births. These records use existing ownership channels; no new actor or
broker implementation is proposed here.

## Candidate census and two-pass rules

One original150ms deadline covers both passes, all membership queries, required
details and memory reads. Freeze an ownership epoch E containing exact forced
identities, all pending anchors/helpers, active/planned/tombstoned SIDs and the
valid closed-D1 execution-profile digest. No changed epoch is accepted.

1. Pass A obtains a bounded complete PID list and acknowledged E/H with no
   unresolved creation interval. A filled/truncated buffer, bad
   native byte/count interpretation or any unclassified row refuses the pass.
   Force root/broker/helpers/observer/anchors/known-owned PIDs to full detail
   before considering outside metadata. For other rows obtain authoritative
   positive SID data; inside or conflicting rows require precise detail.
2. Bracket each required detailed read with membership and exact birth/lineage/
   executable checks. Any contradiction, denied owned detail, reuse or possible
   escape is UNKNOWN_HELD. Outside decisions are local to this pass, not cached
   ownership identities. A repeated SID is not evidence of PID continuity.
3. Pass B repeats bounded membership census under the SAME E/H/deadline.
   Form the union of forced/candidate PIDs seen in either pass. Every member
   must already have valid precise detail for the same incarnation, or a
   positively resolved gone state that does not conflict with a retained lease.
   A newly appearing inside/ambiguous member requires another inspection:
   refuse instead of starting pass C. Changed epoch, incomplete coverage,
   unresolved disappearance or conflicting membership also refuses. Any owner
   population-generation change, even a child born and exited between passes,
   invalidates this certificate. An owner that cannot report such changes
   cannot participate in a valid closed profile. No end-of-pass PID equality
   substitutes for that population proof.
4. Only complete, consistent candidates contribute to a usable sampled sum.
   Successful outside observations can exclude protected detail ONLY while
   the execution proof rules out an unseen owned escape. They cannot establish
   that a PID number denotes the same process across calls. A new admitted
   fork after the accepted boundary belongs to a later sampled event, never
   to a cached outside exemption. Sampling is not an instantaneous memory cap.

An unknown process that escapes/reparents between polls is not ruled out by
two snapshots. The execution-closure lemma must independently rule out that
transition; if not, even two outside SID readings remain insufficient. Private
SID non-joining and unreaped-anchor PID pinning protect candidate scopes, not
arbitrary-PID continuity. Known owned reuse/movement always refuses, even if
the final SID is outside. No empty or denied census releases anything.

The same rules must cover D1 snapshot, retirement and final observer, with
explicit forced identities for each phase. Reaped/tombstoned SIDs are not
treated as live anchored signal authority. Root's exact exit still requires
external confirmation. The original16 unrun permission input cases must drive
the eventual real classifier/scope validator; no toy policy or passing boolean
substitutes for those decisions.

## Evidence status

The profile, import closure and candidate coverage proof are concrete proposed
contracts, not current executable conformance. Environment/prefix/admission
integration and deployed API qualification remain unmet. Inspecting published
Apple source cannot establish access on this deployed machine, so a separate
minimal read-only capability-probe source packet is prepared for independent
review/allocation. It cannot classify a cohort or qualify protected targets
that were not explicitly queried. No classifier change or attempt03 is offered.
