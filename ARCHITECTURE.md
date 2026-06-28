# TimeShift governance architecture

The decisions that govern how rules and skills compose. These sit above the engine spec
(`Scratch/timeshift-engine-spec.md`); where they differ, these govern. The system is
LLM-agnostic and sovereign-deployable throughout (V3 P1).

## The layers

Top to bottom. Authority falls and blast radius rises as you go up:

- **Engine** — root, universal, applies to everyone.
- **Region / Compliance** — externally imposed, above the tenant.
- **Tenant** — the business and its way of working.
- **User** — the staff member: least authority, most constrained inputs.

## Three governing laws

1. **Top-down, deny-by-default.** The top rules. Nothing set at a higher level is open
   to change from below unless that level deliberately delegates it downward. Lower
   levels get a bounded sandbox, not freedom by default. This **inverts the engine's
   current default** of most-specific-wins-unless-locked: the new default is
   locked-unless-delegated.

2. **No upward change.** Authority flows down only. A level may shape its own scope and
   the levels below it, never anything above. A staff member cannot change a tenant
   rule; a tenant cannot change a root rule. No change ever travels upward.

3. **One home per skill — no duplication across the tree.** Every skill and rule exists
   in exactly one authoritative place, inherited downward. No copies anywhere else. A
   lower level never copies-and-edits, because that is both a duplicate and an upward
   conflict. Duplication means two competing sources of truth, which makes "the top
   rules" a lie and guarantees drift.

## The validator is a tree-integrity guard

Adding a skill is not a content scan. On every add, the validator checks the **whole
tree**:

- name exists **above** you → cannot add; you inherit it (no upward duplicate).
- name exists at **your** level → an edit to the one copy; needs that level's authority.
- name exists **nowhere** → genuinely new.

Plus structural hard-checks (path-safe name, valid frontmatter, name matches folder,
size within bounds) and **advisory** injection flags on the body — prose can be flagged
for a human, never mechanically certified. It enforces, together: one home, authority
only downward, drift caught at the door. It is layer-aware: strictness and what is
allowed vary by scope (tightest at User, blast-radius-governed at Engine).

Injection defenses live at their own boundaries, not in this validator: SQL injection is
stopped by parameterised queries (Drizzle), path traversal by name validation, XSS by
output escaping, prompt injection by constrained answer-shapes for values plus human
review and scoping for prose.

## The composition pipeline

```
tree (governance) -> resolve (effective set) -> route (this task's relevant skills)
   -> concatenate (assemble, authority order) -> adapt (format for the target model/host)
```

- **Resolve** the project's effective set: one home per skill, inherited top-down.
- **Concatenate the resolved set, never raw prose, in authority order (top-down).**
  No-duplication is what makes concatenation safe: nothing competing is left to
  reconcile. The order is the governance — the prompt leads with the top's
  non-negotiables, then tenant, then project, then staff.
- A **project is its resolved-and-concatenated skill set**, not a separate object.

## The router

Selects, per task, which of the governed and scoped set is relevant, using each skill's
tiny **trigger surface** (name + description); full bodies load only for the chosen few
(lazy loading, engine spec section 6). It only ever sees the governed set — never another
tenant's skills, never something the top has not delegated. Routing happens inside the
fence.

**LLM-agnostic consequence:** the router must be model-independent. It may use a
**swappable** model or be deterministic (trigger matching / embeddings), but it must not
depend on any one provider, and it must not rely on the host model's native skill
features as the only path. On Claude we **may** delegate routing to Claude's own
mechanism as an optimisation, but the canonical router lives in the agnostic core,
because a sovereign deployment may run a model with no skill-routing at all.

## LLM-agnostic: core versus adapters (V3 P1)

- The **core** is model- and host-agnostic: the slot model, resolver, validators, router,
  and concatenation. It produces a **structured, model-neutral prompt object**, not a
  model-specific string.
- Everything model- or host-specific is a thin **adapter** at the edge:
  - the Claude materialiser + SessionStart hook (Claude skill-loading) is one adapter;
  - formatting the structured prompt for a specific model's conventions is an adapter;
  - a Molo / direct-serve deployment is another adapter.
- Swap the model or the host, swap the adapter; the core does not change.

## Model and credentials: bring your own (default)

Model-agnostic extends to credentials: by default each tenant or deployment brings its
own model and its own keys (BYO). This is the credential side of P1 sovereignty ("your
AI, hostage to no provider"), and it keeps the no-secrets rule intact — the keys are the
tenant's, held **right-of-seam** in the deployment's secret store, **never in TimeShift's
tree**.

- The **model binding** (which provider, which model, how the prompt is sent) is an
  adapter concern at the edge, not in the core.
- **Managing** a tenant's model and keys is **admin** functionality.
- There is no LLM-call surface in the build today: the engine produces prompts; the model
  is consumed at the host/edge. So nothing needs a key yet, and BYO-keys is **deferred to
  the admin build**, with the principle fixed now.
- **Reference implementation** (local dev): the Qalisa project
  (`C:/LocalDev/Qalisa 20260620`) has a working per-tenant key and tenancy pattern to draw
  on — `packages/core/src/auth/apiKeys.ts`, `apps/engine/src/middleware/apiKeyAuth.ts`,
  `packages/db/src/schema/tenancy.ts`.

## What this changes versus the engine today

- The cascade default flips: **deny-by-default top-down**, not most-specific-wins.
- **Skills become first-class governed objects** — they need locks (mandate) and
  registers (authorship class), not just scope plus name-dedup. Today `inheritSkills` is
  most-specific-wins with no lock.
- The admit validator becomes the **tree-integrity guard** above.
- The **router** is a new, model-independent core component.

## Status

Defined here, not yet enforced in code. Built so far: the engine core, the
drift-classifying estate scan, the admit flow (authority gate), and the Claude adapter
(materialiser + hook). To build next, on this foundation: the layer-aware tree-integrity
validator; skill locks and registers; the router. Deferred per engine spec section 12:
versioning, staged rollout, the eval gate, caching, and multi-tenant partitioning — bake
the shapes in now (a version field, one audit substrate, tenantId threaded), build the
tooling later.
