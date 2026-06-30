# TimeShift Hivemind

A composition engine that resolves a scoped tree of rules into a per-agent prompt and
its enforcement harness, plus the tooling to govern a real skill estate through it.

## The engine (`src/`)

Pure, dependency-free TypeScript. One atom (the **slot**) and one process (the
**resolver**, governed by laws L1–L9). Six faces read one resolved object:

- `resolver.ts` — composes an agent's effective rule set (per-key cascade, locks,
  fail-closed validation).
- `validators.ts` + `vocabulary.ts` — constraints compiled from a closed declarative
  vocabulary, failing closed to handoff.
- `render.ts` + `skill.ts` — the prompt (fills grouped by register, lazy skill bodies).
- `oversight.ts` — "explain this agent" and a total, append-only event readout.
- `wizard.ts` — slot interviews projected per audience, with answer-shape as the
  anti-escalation control.

The design spec is in `Scratch/timeshift-engine-spec.md`.

## Hive mode (`tools/`, `hive/`)

Manage a whole Claude skill estate through the engine: the hive is the single source of
truth, materialized into the directory Claude reads on each session.

- `scan.ts` — read-only estate scan: discover every skill source, inventory, and
  classify duplicates as identical or diverged (with the diff measured).
- `admit.ts` — the one reusable intake operation: propose → confirm → accept, with the
  human in the loop and the confirmer's authority enforced per scope.
- `materialize.ts` + `materialize-cli.ts` — the SessionStart hook that projects the
  resolved skill set into `~/.claude/skills`. See `ENABLE-HOOK.md`.

`ESTATE-ONBOARDING.md` describes the founder-absent onboarding pipeline.

## Run the demo (`server/`)

A lightweight Express app that makes the engine drivable in a browser — the Molo serve
loop end to end. See `MOLO-ENGINE.md` for the build plan.

```bash
npm install
cp .env.example .env     # then add a model key (see the file; Claude or any
                         # Anthropic-compatible endpoint). Optional — see below.
npm run dev              # http://localhost:5000
```

Five tabs:

- **Author** — create a governed agent through the engine's wizard. The questions are
  slot interviews projected by scope; the answer shape (a fixed set, a length limit) is
  the security control, checked before anything is written.
- **Serve** — drive that agent: the resolved rules become the prompt, the model answers,
  the output is validated, and it ships only if it passes — otherwise it hands off and the
  output is withheld. Shows the governed prompt and the attested events.
- **Why** — the resolution trail, per-task routing, and the append-only audit log.
- **Estate** / **Admit** — the skill-estate side: scan, classify, and admit skills into
  the hive with the confirmer's authority enforced.

The model is configured server-side only (right of the seam, never the browser). Without a
key the app still runs and every screen works — Serve just hands off instead of answering.

## Develop

```bash
npm test            # vitest, 123 tests
npm run typecheck   # tsc --noEmit, strict (also: typecheck:shared)
```

The engine core (`src/`) has no runtime dependencies (sovereign-deployable). The serve loop
drives a live, governed agent; a Drizzle/Neon-backed store and real auth (`shared/schema.ts`)
are the next build.
