# Viewer qualification and source ownership

The viewer's firmware dependency is its `tec-os/` gitlink, currently
`fe2097f4bad3f7578aa41b8bce8aa571c451dbc7`. The separate TEC-OS checkout used
for firmware development does not change that pin. `pins.json` binds the
resulting ROM and seven card files; its ROM SHA-256 is
`a3dd9ee9763d94efff6b7a93a2cc8f9d7300f04a3e57f5cd0a5f24868f8ed6bb`.

VS1 qualified viewer product `5c99400`, with firmware `78127ec`. VS2 qualified
product `d193838`, with firmware `fe2097f4`; its completed evidence landed at
`76c4aa0`. The retained `evidence/vs1-*` and `evidence/vs2` directories describe
those particular runs, controls and clean-clone outputs. The subsequent
`f68e3e3` adds the local-server command. Historical results do not establish a
fresh build, browser run or native capability in a new environment.

The accepted viewer starts a session without a saved width at 80 columns and
uses the old font. Its worked-example test expects greeting line186 and
cursor `L186 C27`. The [upstream Compact offer](compact-source-offer.md)
changes the receiving requirements; those existing assertions are still
appropriate to the current pin.

Viewer implementation belongs in this repository: page code in `src/`, build
and delivery tools in `tools/`, and their checks in `test/`. Firmware, font and
public host-library implementation belong in TEC-OS. Original study decisions,
sealed source packets and historical results remain traceable in Origo's
`studies/p6-viewer`; changing their location or paths must not silently change
their recorded hashes or turn inactive templates into runnable authority.

The [inactive qualification engineering sources](../tools/qualification/README.md)
now live in this repository. Their [migration map](../tools/qualification/migration-map.json)
binds the exact immutable Origo originals and every source-location edit. The
guard, native caller/owner/C source, diagnostics and declarative controls are
available here for further engineering; they are not enabled commands.

Original source records in Origo include:

- `intake.md`, `stages/compact-source.md` and `models/compact-receiver`: the
  receiving design, named inputs and proposed notice/default mechanisms.
- `models/compact-receiver/guard-prototype`: the original supervision source
  packet, now mapped to `tools/qualification/compact-guard` here.
- `models/native-admission/vd14-successor01`: proposed native membership
  caller, owner, C source and inactive command/bundle templates. These are
  original engineering records, now mapped to `tools/qualification/native-admission`
  here. Historical templates/seals remain separate from the relocated sources.
  Changed source paths and complete command/provider bindings still require
  independent review before use.

Native source review does not supply a supported Mac executor, SDK/provider
closure, native build/run evidence or the remaining A5 admission. Those
prerequisites remain open. The partial phosphor model has no accepted product
candidate/default. Generated recipe/map and standalone stale-output integrity
work (VS4) also remains open. Source relocation records no new runtime result
and supplies no Mac qualification.
