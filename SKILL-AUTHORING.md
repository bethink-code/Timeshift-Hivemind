# Governed skill authoring — action plan

How a new skill gets into the hive **safely**, sized to *who* is authoring it. This is the
design that came out of the 2026-06-30 session. It sits under `ARCHITECTURE.md` and §7 of
`Scratch/timeshift-engine-spec.md` (the security section), and it is the "secret sauce."

## The problem

> *"Free text is the vulnerability."* — spec §7

A person sitting in a project we've never heard of must never get a free-text box where
they can paste a massive prompt and have it become governed behaviour. The defence is
**structural, not detective** — the spec's bar is *"cannot be made to compose wrongly,"*
not *"we try to catch wrong."*

## Governing principles (non-negotiable)

1. **The interaction surface is itself a privilege boundary.** A free-text box is a
   high-privilege surface; a questionnaire of constrained answer-shapes is a low-privilege
   one. You hand each person the surface their authority earns.
2. **Trust gradient.** staff → smallest questionnaire (personal config); tenant-admin →
   a bigger form (the business's rules); **platform-owner (us) → the only ones who author
   raw system/engine prompts.** Free text lives only at the top.
3. **The AI drafter changes the *ergonomics* of authoring, never the *authority*.** It
   sits **behind** the gate. An unauthorised person's AI-drafted skill dies at the gate,
   exactly as a hand-typed paste would. The drafter must never become an authority-
   laundering channel.
4. **Skills are the soft spot.** A skill body is inherently free text (unlike a slot,
   which is protected by answer-shapes). So skills are governed by **authority + scope +
   top-down lock**, not answer-shapes — and the drafter must not widen that hole.
5. **Every add clears the three gates** (`tools/admit.ts` `applyDecisions`): a human
   confirmed it **AND** an authorised principal (role + tenant) confirmed it **AND** the
   integrity guard admits it. A ticked upward-duplicate still does not take.
6. **Nothing is silent.** Authoring is attested in the append-only log.

## Two paths

### Path 1 — Platform-owner authors their own skill *(build first)*

We're the top of the trust tree, so there is **no questionnaire** — it's just Claude's
native authoring with our gate underneath:

> describe → Claude drafts a proper `SKILL.md` → we review → admit to hive → attest

Claude understands the skill format natively (per the official docs — *"you don't need a
'writing skills' skill, just ask Claude"*), and our gate enforces the structural subset.

### Path 2 — A project with admins and staff *(the Molo governance)*

> create a project → a **baseline template** → which **generates the per-role forms**
> (tenant-admin, staff, compliance) as `buildWizard` projections

Staff fill a **constrained questionnaire** that produces a *request*, not a skill. The AI
drafts the body. A **trusted authority reviews the prose and confirms** (`canConfirm`
enforces who). The low-trust human's hands never touch free text; the trusted authority's
eyes are the only ones that ever sign the behaviour.

## What we reuse (already built)

- `src/integrity.ts` — boundary / overwrite / structural gate. **Already mirrors Claude's
  skill rules**: kebab-case name (the path-traversal defence), ≤64 chars, description
  flagged-if-missing, per-layer body-size ceilings.
- `src/authority.ts` — `canConfirm` (role + tenant).
- `tools/admit.ts` — `propose`/`proposeOne` (new/identical/**diverged**=overwrite) +
  `applyDecisions` (the three-gate intake).
- `src/wizard.ts` — `buildWizard` / `validateAnswer` (answer-shapes; the per-audience
  forms generated from a template).
- `adapters/anthropic.ts` + `src/serve.ts` — the model-call seam (drafting; works with
  Claude or the Z.ai GLM key via `.env`).
- `server/tenants.ts` (store) + the append-only audit substrate.

## Claude's skill best practices (the draft must follow)

From Anthropic's `skill-creator` skill + the official authoring-best-practices doc:

- **name** ≤64, lowercase-kebab, no `anthropic`/`claude`.
- **description** ≤1024, **third person**, says *what it does AND when to use it*, specific
  and a little **pushy** — under-triggering is the #1 failure mode. This field is how
  Claude decides to fire the skill.
- **body** <500 lines, concise (*"context is a public good"*), imperative voice,
  progressive disclosure (extra files one level deep), no time-sensitive info.
- Match **degrees of freedom** to the task (text instructions for flexible, exact scripts
  for fragile). Be **evaluation-driven** for skills that need to be good.

## Ordered slices

**Slice 1 — Platform-owner "Draft a skill" (near-term, high value).**
A describe box (platform-owner only) → the adapter drafts a `SKILL.md` per Claude's rules
→ `checkSkillAddition` + `proposeOne` run on the draft → a review screen shows the draft +
the verdict (path-safe? diverged? injection flags?) → confirm with platform-owner authority
→ write to `hive/skills/<name>/SKILL.md` + manifest entry → attest.
*Acceptance:* a described skill becomes a governed hive skill; a colliding name is caught
as `diverged`; with no model key it fails-closed (handoff), never silently.

**Slice 2 — Harden the AI path.**
Injection markers **block** (not just flag) on AI-drafted skills; add the reserved-word
name check (`anthropic`/`claude`); add a description-quality review aid (specific + pushy?).

**Slice 3 — Project templates → generated forms (the bigger governance).**
A baseline template + per-project tailoring (the platform-owner craft surface, optionally
AI-assisted); `buildWizard` generates the tenant-admin / staff / compliance forms from it;
project-creation becomes the front door (project ▸ agents hierarchy).

**Slice 4 — Low-trust request path.**
Staff / tenant-admin questionnaire → skill *request* → AI draft → authority review-and-
confirm. No free-text field below the authority line, anywhere.

## Open decisions (confirm before building)

- Injection-block on the AI path: hard reject, or block-unless-platform-owner-override?
- Should staff/agent roles even *see* a drafter, or is it gated to tenant-admin+? (lean:
  gated — don't render the dangerous surface to the dangerous role).
- Where the "Draft a skill" screen lives (new tab vs. under Admit).

## Not now

- The full `skill-creator` eval/benchmark loop (with-skill vs baseline, graders, viewer).
- Automated description-triggering optimization.
