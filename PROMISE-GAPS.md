# Promise gaps — the checklist to a kept promise

The codebase audited against the promise in `VISION.md` (2026-06-28). Fix all of these,
in this order, before building the interface. Each is a tested, committed step.

## P1 — "Your most important rules can't be quietly overridden." — was BROKEN
Skills resolved most-specific-wins with no lock (`inheritSkills` overwrote higher with
lower). Slots can lock but default to open.
- [x] Governed skill resolution: locks, top-down, deny-by-default (`resolveSkills`).
- [x] Flip the slot resolver default to locked / top-down (slots). `behaviour` is now
      `locked` (default) / `open`; the resolver is top-down, deny-by-default. Governance
      and enforcement are decoupled: a new `enforcement` (`fail-closed`/`advisory`) axis,
      not the lock, decides whether a failed check hands off.

## P2 — "Nothing changes without the right person's yes; every change on the record." — PARTIAL
`by` is a self-declared string (no identity); the audit is fragmented (admit only; the
hook is silent; direct file edits are unlogged).
- [ ] Authority takes a verified Principal {id, tenant, role}, scoped to a tenant.
- [ ] One append-only audit substrate; admit + materialize + resolution all emit; the
      hook records its failures.

## P3 — "You can always see exactly why your AI does what it does." — PARTIAL
Slot resolution is explainable; skill selection had no trail; the router is missing; the
"why" is not surfaced in the UI.
- [x] Skill resolution trail (`resolveSkills` records won / overridden / blocked-by-lock).
- [ ] The router (per-task relevance) — later, a new component.
- [ ] Surface the "why" in the interface — with the interface.

## P4 — "The safe way is the easy way; we won't let you make a wrong move." — PARTIAL
Admit checks only the exact same slot; no whole-tree duplicate or upward check; no
path-safe name; not layer-aware.
- [ ] Tree-integrity validator: above → inherit, same level → needs authority, nowhere →
      new; enforce no-duplication and no-upward-change.
- [ ] Path-safe names + frontmatter / size checks.
- [ ] Layer-aware strictness (tightest at User).

## P5 — "It stays yours: your AI, your keys, no lock-in." — MOSTLY KEPT
Engine is model-agnostic; the hive is portable files; no secrets held. BYO-keys not built.
- [ ] BYO-keys (admin build, Qalisa reference) — deferred, not blocking.

## Build order
1. Governed skills (P1 skills, P3 skill-trail) — **done**
2. Flip the slot resolver default (P1 slots) — **done**
3. Tree-integrity validator (P4)
4. Authority Principal + tenant-scoping (P2)
5. Unified audit substrate (P2, P3)
6. Later, with the interface/admin: the router, the "why" screen, BYO-keys
