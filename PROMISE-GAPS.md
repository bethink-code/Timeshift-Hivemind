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

## P2 — "Nothing changes without the right person's yes; every change on the record." — DONE
`by` was a self-declared string (no identity), and the audit was fragmented (admit kept its
own rewritten `audit.json`; resolution used the in-memory log; the hook was silent).
- [x] Authority takes a verified Principal {id, tenant, role}, scoped to a tenant
      (`src/authority.ts` `canConfirm` — enforces role AND tenant; a tenant-admin of one
      tenant cannot act on another. Wired into admit; the demo edge marks the trust
      boundary — identity comes from the session in production, never the request body).
- [x] One append-only audit substrate (`EngineEvent`): admit (`admissionEvents`),
      materialisation (`materializationEvent`), and resolution (`recordResolution`) all
      emit; the hook records `skills.materialized` on success and `materialize.failed`
      instead of failing silently. Durable as append-only JSONL (`tools/audit-log.ts`
      `FileAuditLog`), replacing admit's rewritten `audit.json`.

## P3 — "You can always see exactly why your AI does what it does." — DONE
Slot resolution is explainable, skill selection has a trail, the router records its
matches, and all three are now on the interface.
- [x] Skill resolution trail (`resolveSkills` records won / overridden / blocked-by-lock).
- [x] The router (`src/router.ts`): deterministic, model-independent per-task relevance from
      trigger surfaces (name + description) only, so bodies stay lazy. A `Router` interface
      lets a model/embedding router swap in; each selection records the matched terms (the
      "why"). `routedNames` feeds `renderPrompt`'s `selected`.
- [x] Surface the "why" in the interface (`server/why.ts` + the Why tab): why these skills
      (the resolved set + trail), why each loads for a task (the router's matched terms),
      and the audit log — all real projections of the engine over the live hive.

## P4 — "The safe way is the easy way; we won't let you make a wrong move." — DONE
Admit checked only the exact same slot; no whole-tree duplicate or upward check; no
path-safe name; not layer-aware. Now `src/integrity.ts` (`checkSkillAddition`) is the
tree-integrity guard, wired into the admit flow as a third gate after the human tick.
- [x] Tree-integrity validator: above → inherit (rejected, no upward duplicate), same
      level → edit needing authority, below → supersedes the lower copy, nowhere → new.
- [x] Path-safe names + frontmatter (description) / size checks.
- [x] Layer-aware strictness (tightest at User): per-layer body-size ceilings, blast-radius
      flag at Engine.

## P5 — "It stays yours: your AI, your keys, no lock-in." — MOSTLY KEPT
Engine is model-agnostic; the hive is portable files; no secrets held.
- [x] BYO-keys SHAPE baked (`shared/schema.ts` `tenant_model_bindings`): a tenant binds its
      own provider + model, and only a `keyRef` (an alias into the deployment's secret store)
      is recorded — never the key. The seam holds the secret.
- [ ] BYO-keys admin TOOLING — deferred to the admin build, by design: there is no
      LLM-call surface yet (the engine makes prompts; the model is consumed at the edge), so
      nothing reads a key. Build it when the serve/admin surface lands. Qalisa is the reference.

## Build order
1. Governed skills (P1 skills, P3 skill-trail) — **done**
2. Flip the slot resolver default (P1 slots) — **done**
3. Tree-integrity validator (P4) — **done**
4. Authority Principal + tenant-scoping (P2) — **done**
5. Unified audit substrate (P2, P3) — **done**
6. The router (model-independent core) — **done**
7. The "why" screen (P3, on the interface) — **done**
8. BYO-keys: shape baked — **done**; admin tooling deferred to the serve/admin build

All five promises are now kept in code and tested. What remains is the live flip (enable
the SessionStart hook in ~/.claude/settings.json — the test run) and, later, the BYO-keys
admin tooling once there is a model-call surface to use it.
