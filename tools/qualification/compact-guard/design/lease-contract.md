# Executable prototype lease and ownership contract

This contract describes source, not a successful run. The admitted candidate is root.py plus the Node harness. It uses Darwin POSIX/libproc through ctypes and needs no compiled binary to establish cold-start ownership. C units are retained separately; the standalone native broker refuses raw CONT and is not offered as a workload fallback.

## Authority and immutable inputs

The external allocation record names one case/variant, actual owner, explicit allocation status and final source-seal SHA. The root entry exclusively creates output, starts common T0 before keys/seals/readiness, and writes RESERVED. Only later allocated execution generates per-run Ed25519 test keys. The fixed source authority-root.json is unchanged/unprepared. Run-local test authority is explicitly EPHEMERAL_PROTOTYPE_TEST_ONLY and bound by an independent path/SHA environment pair. It conveys no production authority.

The signed lease binds run/owner/nonce, full guard/anchor identities, baseline/guard/adapter/probe/bootstrap script and interpreter bytes, exact workload argv SHA, anchored G token, separate peer identities/keys/sockets, receipt sequence heads, policy and common absolute T0. The executable inspector is executable root.py with its real /usr/bin/python3 shebang and exact identity-PID mode; it is not falsely labelled a compiled native binary. The Python bootstrap is a separate sealed script/interpreter pair. It validates inherited parent/SID/PGID/command context, stops before target work and execs only after broker-owned continuation. Native bootstrap.c remains a source reference.

Fork-copied launch argv and byte seals are immutable broker memory, not mutable plan-file names. The worker verifies executable and all declared source bytes before exec. Controller transition approvals bind token, exact anchor birth, generation, phase, planned G, immutable plan SHA and deadline. ack-check.mjs verifies BOTH peer signatures in a retained direct-child non-forking helper before the broker can continue a non-startup group. A raw capability, name, integer PID or static nonce cannot satisfy that check.

Initial controller bootstrap is restricted to the named frozen run/peer/guard-entry programs. Direct-parent root/broker records acknowledge those stops before independent peers exist; no fictional peer signature is generated. The one startup allowance is consumed at actual worker continuation. All later work, including guard bootstrap and browser/fault groups, requires dual durable approvals. Every permitted new session is created by the broker's stopped direct-child protocol.

## Independent peers and guard

Supervisor and watchdog have separate processes, private groups, signing keys, sockets and heartbeat streams. Each checks kernel ownership independently. Every guard request carries a fresh256-bit challenge and complete prepared-lease hash. Receipts are fsynced immutable content-addressed files, signed over canonical sorted-key JSON; fields bind request hash, run, writer, role, sequence/previous digest, observation time and publication state. The watchdog additionally verifies/binds the exact supervisor receipt. Main lifecycle originals are not changed or concurrently written.

The guard publishes acknowledged G before spawning a non-detached sealed bootstrap. Positive SSTOP, direct guard parent, precise birth, actual executable and inherited G must all hold. It consumes one deadline-checked spawn permission and routes every admitted failure through one structured finalizer. Registered code requests stop only: it cannot use legacy tree/group kills or release the lock/reservation.

Cohort observations deduplicate PID/birth identities across root/broker/guard/peers/probes/worker/server/browser/observer. Kernel birth, path, SID/PGID and memory observations are combined with pre-hashed executable seals whose device/inode/size/mtime must remain unchanged. A changed or unknown executable refuses observation. This byte-identity cache is not a hash of the loaded mapped image. Darwin system-library mappings are recorded by actual Mach-O image UUID, separately from file SHA claims. Runtime SDK layout and shared-clock checks precede model work.

## Safe signalling and retirement

The broker alone retains parent wait ownership of every anchor. SIGCHLD is default, there is no broad anchor reaper, and observations use targeted WNOWAIT/WNOHANG. Consuming a stop event excludes WEXITED and checks exact PID/code/SIGSTOP. ECHILD loses authority. Signals use only an owned opaque token. The unreaped child pins PID/SID/PGID even after leader exit; a zombie is never described as a live executable anchor. Private SID excludes foreign joins, while sealed programs must route every permitted escape through another registered broker anchor.

Retirement closes launches, checks non-anchor session membership and observed owned escape identities, revokes the token, then reaps the exact exited anchor. No signal occurs after reap. Non-atomic process snapshots are not a general containment proof; an unexpected or unobserved escape is outside the trusted sealed-launch contract and blocks readiness rather than permitting a numeric fallback. B1/B2 must prove the installed Chromium path, helpers, CDP and cleanup. No real-browser success is inferred from sleepers.

Broker death/unresponsiveness is authority loss, retaining unresolved ownership. Controllers never fallback to check-birth-then-generic-kill. Broker filesystem publications and signature checks run in directly owned bounded helper children, retained until exact reap; timeout leaves unknown ownership for cleanup. Outer code is not promised to make an unresponsive OS disappear by a timestamp.

## Absolute deadlines and bounds

New shared clocks use mach_continuous_time with mach_timebase_info conversion. Pinned Node24.18.0/libuv uses the same domain; Python monotonic's process-relative origin is explicitly rejected. Probe clock values must lie within the caller's observed bracket, allowing100µs rounding within the150ms probe budget. No clock calibration has run. Source references: Node24.18.0 deps/uv/src/unix/darwin.c and CPython3.9 Python/pytime.c, as identified in independent review; SDK mach/mach_time.h defines the native interface.

Synthetic offsets2/3/4/5 and real110/115/118/120 cover startup, source/dependency seals, test keys, guard, server/browser, screenshots and cleanup. Graceful closure does not force KILL early. The operator envelopes10/125 seconds permit incident reporting but never late success. Late controllers still request safe KILL and hold. The broker has a bounded final unknown handoff; no forever ordinary KILL/poll loop is offered.

Configured limits:32 groups;65,536 PID slots;256 cohort/executable identities;16 concurrent broker clients; IPC request64KiB/reply256KiB,150ms; native inspection150ms; retained publication/verifier helper150ms; adapter startup/operation1second inside hard T0; receipt freshness250ms; identity stdout/stderr64KiB each; source file32MiB; executable512MiB; file chunks64KiB; artifact journal16MiB/4,096 records; browser dependency tree4,096 entries/depth12/256 executables/2GiB total. No truncation is accepted as completeness. Source and resolved dependency hashing is sequential. These are configured bounds, not measured latency/memory guarantees. Pending filesystem calls, process startup and uninterruptible kernel work still require owned-process termination or an unresolved incident.

## Terminal observation

Actual activation and continued-state/exit predicates live in oracle.py. Missing activation is incomplete. D3 self-assertions are insufficient; the root records exact independent before/after-TERM lineage. D11 requires actual bootstrap exit0. B1 requires actual served bytes/PNG and observed normal browser exit. Unknown history or nonzero broker exit cannot become clean success from an empty final snapshot.

After all exact anchor retirements the broker exits. A separate observer verifies and reports its own precise identity plus the still-live root. Root observes/reaps that exact observer, then reports ROOT_EXIT_CONFIRMATION_REQUIRED with root still positively alive and full costs. Only an external caller observing that root's precise disappearance may release. No source path writes RELEASED, and no reservation follows guard-lock absence.
