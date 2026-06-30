# Driving Molo with the engine

The map for the next phase. TimeShift's agnostic core is Molo's engine — the universal
play. The Claude-skills hive was the dogfood (proven live across three Claude Code
surfaces); Molo is the real consumer. This note fixes the shape before any code so the
build doesn't sprawl, and names which parked decisions each step reopens.

It sits under `ARCHITECTURE.md` (the governing laws) and `VISION.md` (the V3 map); where
they differ, those govern.

## What is already the engine

The hard, novel part is done (109 tests green, typecheck clean). The agnostic core *is*
the V3 architecture in code: P2 universal engine = slot model + resolver (top-down
deny-by-default); P3 tenant template = tenant-scope slots/skills resolved per agent; P8
fail-closed handoff = validators; P9 attestation = the append-only audit substrate;
LLM-agnostic = router + `renderPrompt` produce a structured, model-neutral prompt object;
tenant isolation = `Principal` + `canConfirm`. The engine already turns a governed tenant
tree into a prompt **plus** an enforcement harness. That is Molo's core.

What does not exist yet: **nothing calls a model.** The engine makes prompts; the model
is consumed at the edge. Everything below is that edge.

## The proof slice (build first)

A thin end-to-end serve loop, one tenant, no UI:

    tenant tree → resolve → structured prompt → CALL THE TENANT'S MODEL
                → run validators on the OUTPUT → ship-or-handoff (fail-closed) → attest

The engine already owns every box except the model call: `renderPrompt`,
`compileValidators` / `runValidators` (→ handoff status), and the audit substrate. This
slice flips TimeShift from "engine that *makes* prompts" to "engine that *drives* a live,
governed agent" — mirroring how the materialiser proved the Claude side. It is also the
first surface that un-defers **BYO-keys**: the model binding is an adapter, the key is
held right-of-seam (never in this tree), and the shape is already baked
(`shared/schema.ts` `tenant_model_bindings` = provider + model + keyRef alias).

**✓ BUILT & PROVEN LIVE (2026-06-30).** `src/serve.ts` is the pure loop (the model is an
injected `ModelAdapter`, so the core stays I/O-free); `adapters/anthropic.ts` is the first
real adapter (x-api-key for native Anthropic, Bearer for an Anthropic-compatible endpoint);
`tools/serve-cli.ts` runs it over a fixture tree. Proven end-to-end against **two providers
through one unchanged loop** — Claude and **Z.ai GLM-4.7** (`model: anthropic:glm-4.7`,
shipped, attested seq 16) — which is the model-agnostic (P1) claim demonstrated, not just
asserted. Next: slice 2 (a tenant-scoped `loadTree` backbone) replaces the fixture tree.

## Ordered slices, and what each reopens

1. **Serve loop (proof slice).** Model call behind a thin adapter interface + output
    validation + attest. Reopens: **BYO-keys** (key held right-of-seam, model binding =
    adapter) and **model-call config** (which provider/model for the proof — pick one,
    hard-coded behind the adapter, not a tenant feature yet). Does *not* need a database:
    run it against an in-memory or fixture `SlotTree` first.

2. **Multi-tenant backbone.** **✓ SEAM DONE (2026-06-30, in-memory).** `src/store.ts` is the
    pure `TreeStore` contract (`tenants()` + tenant-scoped `loadTree`); `server/tenants.ts` is
    an `InMemoryTreeStore` of three governed agents across two tenants, isolated by
    construction (an agent is unreachable under another tenant's id — `test/store.test.ts`).
    The Serve screen now picks a tenant's agent; proven live (Acme Health claims-assistant
    composed its own no-diagnosis rule alongside the inherited platform no-guarantees rule).
    A tenant-scoped `loadTree` reads a real `SlotTree` from
    storage; wire `Principal` to real auth; `db:push`. **STILL PENDING (needs accounts):** the
    Drizzle/Neon-backed `TreeStore` behind the same interface, real `Principal` auth, db:push.
    Reopens the parked SaaS stack —
    **Neon** (main/dev branches), **Google OAuth**, **Doppler** — all blocked on Garth's
    accounts (`.env.example` exists; do not provision without them). `shared/schema.ts`
    now leaves the orphan state and joins the build (its drift guard already landed).

3. **Vertical template (P3).** Real content for a first vertical (working assumption:
    financial benefits-counselling, Momentum proof). Affects template content only, not
    the backbone. Reopens spec §13 open questions: answer-shape vocabulary, the
    choice-slot branch mechanism.

4. **Admin.** Tenant/agent authoring (`buildWizard` exists; no UI) and BYO-keys
    management. Reopens the deferred admin build.

## What stays parked until its slice

Neon / OAuth / Doppler provisioning (slice 2, needs Garth's accounts). Heavy React — keep
the client-facing frontend lean (Astro / plain HTML) per P7. Ingestion stays right-of-seam
(content, not the engine's job) per P5. Reference impl for the BYO-keys / tenancy pattern:
**Qalisa** (`C:/LocalDev/Qalisa 20260620`) — `packages/core/src/auth/apiKeys.ts`,
`apps/engine/src/middleware/apiKeyAuth.ts`, `packages/db/src/schema/tenancy.ts`.

## The one open call before slice 1

The serve loop needs *a* model to call. Options: hard-code one provider/model behind the
adapter for the proof (cheapest, BYO-keys stays a shape), or stand up the
`tenant_model_bindings` read + a real key from the seam now (proves BYO-keys end-to-end
but pulls key-management forward). Recommendation: hard-code for the proof, then make it
real in slice 2 alongside the backbone — so the proof slice needs no accounts.
