# TimeShift Hivemind — Code Review

**Date:** 2026-06-30
**Scope:** Full codebase review (architecture, core engine, I/O edges, schema, tests, docs, build state).

---

## What this codebase is

TimeShift Hivemind is a governance engine for AI "skills" and "slots" — a control room that enforces top-down, lockable, deny-by-default rule inheritance across scopes (`timeshift` → `region` → `tenant` → `agent`), with an authority gate (verified `Principal`), an append-only audit substrate, and a SessionStart hook that materializes the resolved skill set into Claude's skills directory.

The architecture is deliberately layered:

- **Pure, dependency-free core** in `src/`.
- **I/O edges** in `tools/` and `server/`.
- **Deferred Drizzle persistence schema** in `shared/`.

---

## Build state (verified)

| Check            | Result                                   |
| ---------------- | ---------------------------------------- |
| `npm run typecheck` | **Passes clean**                      |
| `npm test`          | **109/109 pass** across 16 files      |
| Lint markers        | Zero `any`, `@ts-ignore`, `TODO`/`FIXME` in `.ts` source |

---

## Strengths

1. **Clean purity boundary.** The core engine (`src/`) is dependency-free; all I/O is pushed to `tools/`/`server/`. The "P1" rule (pure core, I/O at edges) is stated in headers and actually held.
2. **Unusually strict TS config** — `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`. The codebase genuinely complies (the `...(cond ? {x} : {})` optional-spread pattern is used correctly throughout).
3. **Security-first thinking that's real, not cosmetic.** Path-safe names, per-layer body-size ceilings, prompt-injection smell detection (advisory, not blocking), register-isolation, deny-by-default locks. The resolver has **adversarial tests** (privilege escalation, list-manipulation, scope/register contradiction) — above average for a project this size.
4. **Explicit trust-boundary documentation.** `server/index.ts` lines 9–12 call out that taking the principal from the request body is a demo shortcut, and boundary validation (`parsePrincipal`, `asRecord`, `isScope`, `isRole`) is done at the edge.
5. **Fail-safe hook design.** `materialize-cli.ts` degrades to "no change" on any error, exits 0, and records `materialize.failed` rather than breaking the session.
6. **Correct append-only audit.** `FileAuditLog` uses JSONL (true append semantics), replacing the old rewritten-JSON-array approach.
7. **XSS-conscious frontend** (`esc()` on all interpolated values).

---

## Findings, by severity

### High — should address before widening scope

- **✓ RESOLVED (2026-06-30) — `shared/schema.ts` was silently un-typechecked and uninstallable.** `tsconfig.json` `include` was `["src","test","tools","server"]` — `shared/` was **excluded**, and the file imported `drizzle-orm/pg-core`, which was **not in `package.json`**, so it could drift (it imports `Register`, `Scope`, `Kind`, etc. from `../src/index`) with zero compiler feedback. **Fix:** `drizzle-orm` added to `dependencies`; new `tsconfig.shared.json` + `typecheck:shared` script typecheck the schema against the live core types. Verified the guard fails on a renamed core type and passes clean otherwise.
- **Side-effecting server files are untested.** `server/why.ts` *is* covered (`test/why.test.ts`) — it's a thin pure projection over the hive (`whyProjects/whyResolve/whyRoute/whyAudit` take a root path, no Express or FS-mutation surface), so it tests like the core. The genuinely untested files are `server/estate.ts`, `server/onboard.ts`, and `server/index.ts` — exactly the ones carrying the side effects (the hardcoded scan path, manifest writes, request parsing), which is where the path/environment bugs below live. Highest-value coverage gap.
- **✓ RESOLVED (2026-06-30) — No CI.** `.github/` did not exist despite a GitHub remote; typecheck + tests ran only locally. **Fix:** `.github/workflows/ci.yml` runs `npm ci`, `typecheck`, `typecheck:shared`, and `test` on push to `main` and every PR.

### Medium — real bugs waiting for a different machine/user

- **Hardcoded environment paths in the server.** `server/estate.ts` and `server/onboard.ts` call `scanProjects("C:/LocalDev", "TimeShift HiveMind 20260626")` — an absolute Windows path *and* this repo's own folder name. The CLI twin (`scan-cli.ts`) makes `--dev` configurable; the server does not. Anyone else running `npm run dev` gets wrong/empty estate data with no error.
- **`bundleRoot()` is Windows-only** (`APPDATA/.../local-agent-mode-sessions/skills-plugin`). Fine for the reference machine; not portable.
- **Race conditions in `acceptOnboarding` / `FileAuditLog`.** Read-modify-write on `manifest.json` with no locking; `FileAuditLog.append` computes `seq = read().length` then appends — two concurrent confirms can collide on seq (breaking the monotonic, gap-free guarantee) or lose manifest entries. Acceptable at single-user dev scale; a production gap.
- **✓ RESOLVED (2026-06-30) — Non-atomic manifest write.** `writeFileSync(manifest.json, …)` could corrupt mid-crash the manifest the hook depends on. **Fix:** `acceptOnboarding` now writes `manifest.json.tmp` then `renameSync`s into place (atomic on the same filesystem).

### Low — robustness/polish

- **Express routes have no try/catch.** Any throw (missing/corrupt manifest, FS error) surfaces as a raw 500/stack. Fine for local dev; an unhandled-exception surface later.
- **`parseDecisions` silently drops malformed items** (`continue`) and returns 200 — client gets no feedback about rejected input.
- **Frontend fetch has no error handling** — a failed `/api/*` leaves the view on "…" indefinitely.
- **`free-port.mjs` force-kills whatever holds port 5000**, not necessarily a previous server instance. Scoped (good), but unconditional (slightly risky).
- **Doc drift to verify:** actual test count is **109**; the README and ARCHITECTURE numbers should be confirmed to match (not fully cross-checked in this review).

---

## Net assessment

This is a well-engineered, security-conscious codebase with a clear architecture and genuinely adversarial testing of its hardest invariants. The remaining weaknesses are almost entirely in the **I/O/edge layer** (hardcoded paths, untested side-effecting server files, the concurrent-confirm seq/entry race) — exactly the seam the design deliberately keeps separate from the core, so they're contained and fixable without touching the engine. The schema drift guard, CI, and atomic manifest write were closed on 2026-06-30 (see ✓ markers above).

---

## Suggested next steps (highest-impact, lowest-risk batch)

1. ~~Add a `shared/tsconfig` guard so the orphaned schema can't silently drift.~~ **✓ Done 2026-06-30.**
2. Parameterise the hardcoded `C:/LocalDev` paths in the server (mirror the CLI's `--dev`). *(Outstanding — folding into the Molo serve-loop phase, where storage-backed `loadTree` replaces the scan.)*
3. Add server-layer smoke tests (`estate`, `onboard` over a temp hive fixture). *(Outstanding — same phase as #2.)*
4. Make the manifest write atomic (temp + rename) **✓ Done 2026-06-30** — and harden `FileAuditLog` seq against concurrent appends *(still outstanding; single-user dev only)*.
5. ~~Add a minimal GitHub Actions workflow (`typecheck` + `test`).~~ **✓ Done 2026-06-30.**