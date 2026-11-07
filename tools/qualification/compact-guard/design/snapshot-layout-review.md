# First snapshot diagnostic recut

Source-only. No cause is inferred for the retained preactivation failure. No failed-run artifact is modified, reclassified or replaced, and no retry is allocated.

## Static SDK comparison

The installed SDK sys/resource.h defines rusage_info_v0 as a16-byte UUID followed by10 uint64_t fields. Usage matches that order and96-byte size. User/system offsets are16/24, resident64, physical footprint72 and exit-abstime88. Flavor remains0. libproc.h declares proc_pid_rusage(int,int,rusage_info_t *); the existing ctypes opaque-address argument with byref(Usage) supplies the96-byte structure buffer. No pointer-to-pointer rewrite is justified by the typedef spelling.

SDK proc_bsdinfo is136bytes with birth sec/usec offsets120/128. The source's unused nice label is unsigned while SDK pbi_nice is signed32; width/offset are identical and it is not read by this snapshot. That unrelated signedness is unchanged. No snapshot ABI mismatch is established. SDK siginfo_t is104bytes. Clang syntax-only static assertions confirm SDK sizes/offsets; Python source was only AST-parsed, never imported or instantiated.

## First cause, before stop

The broker retains its first snapshot exception OR sampled over-limit cause before this snapshot requests stop. Evidence includes sample start/end and original fixed deadline, phase/operation, PID/available identity, native return and immediately captured errno, expected sizes, usage offsets and raw96-byte usage data, resident/footprint, accumulated total and unchanged700MiB threshold. Partial table/cohort/attempted/completed progress is explicit. No incomplete inspection becomes a usable sample. Later stop/publication errors cannot replace the first cause.

Publication reuses the existing owned helper, with the ORIGINAL snapshot deadline passed through. It does not obtain a fresh next-phase window. Already expired diagnostics or due escalation skip publication and proceed to stop. Diagnostic output is bounded to16KiB using exactly dump's JSON encoding plus newline, including all fields and a post-publication-error recheck. A fixed fallback retains first cause/native context/last raw memory call; omitted progress is labelled. Attempted and completed memory reads are distinct.

A skipped/failed publication leaves in-memory evidence, not durable proof. A bounded broker reply can transfer that first cause to the root incident, but neither memory retention nor an attempted write certifies durability. No publication or timeout has been exercised by this source recut. The existing150ms inspection/publication limits are acceptance/enforcement policy, not measured latency or interruptibility proof.

## Fresh future D1 paths

The unallocated D1 vector now names /tmp/p6-ve7-D1-only-attempt02, its attempt02 external/observer paths and /tmp/p6-ve7-allocations/D1-only-attempt02.json. Earlier D1 output/external/observer paths are retained untouched. There is no deletion, reuse or automatic retry. Other19 argv vectors are unchanged and unreviewed.

CommonT0,2/3/4/5-second actions,10-second operator envelope,700MiB sampled threshold,wait0, retained-child/dual-ack signalling authority, UNKNOWN_HELD and external exact-root-exit confirmation remain unchanged. Source-seal and snapshot-diagnostics.diff describe this recut; they are not a run result or allocation.
