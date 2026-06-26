---
name: simplify
description: Review changed code for reuse, quality, efficiency, and structural health. Fix duplication, extract shared helpers, enforce file size limits, and clean up accumulated cruft.
---

# Simplify

Review recently changed code and fix any reuse, quality, or structural issues. This is the cleanup pass that should happen after every 3-5 related edits but often doesn't.

## What to review

1. Run `git diff --name-only HEAD~1` to find recently changed files (or `git diff --name-only` for uncommitted changes)
2. Read each changed file in full — not just the diff
3. Also read any files that import from or are imported by the changed files (one level of adjacency)

## Checks — apply fixes immediately

### Duplication
- **Same function defined in multiple files**: Search the project for the function name. If it exists elsewhere, extract to a shared module and update all call sites.
- **Same formatting pattern**: Money (`toLocaleString` with currency), dates (`toLocaleString`, `toLocaleDateString`), percentages (`Math.round(n * 100) + "%"`), time-ago calculations. These must use `client/src/lib/formatters.ts`.
- **Same JSX block**: Tab navigation, stat cards, status indicators, action bars repeated across components. Extract to shared components.
- **Same data transformation**: Filtering, sorting, mapping logic that appears in multiple places. Extract to a utility function.
- **Same label/status map**: Record<string, ...> lookups for regimes, statuses, moods, etc. Move to `client/src/lib/constants.ts`.

### Scattered patterns
- **Inline cache invalidation**: Any `qc.invalidateQueries()` call not going through a helper in `client/src/lib/invalidation.ts`. Create or extend the helper, then replace all inline calls.
- **Inline business logic in routes**: Route handlers doing calculations, filtering, or state transitions. Extract to pure functions in `server/modules/`.
- **Inline validation in routes**: Zod schemas or manual validation defined inside route handlers. Extract to a shared validation module if used by multiple routes.

### Structural health
- **File size**: Any changed file over 300 lines. Identify natural split points (sub-components, route groups, utility functions) and extract.
- **Function size**: Any function over 50 lines. Break into smaller focused functions.
- **Deeply nested conditionals**: More than 3 levels deep. Refactor with early returns or extracted helper functions.

### Cleanup
- **Dead code**: Unused imports, unreachable branches, commented-out code blocks. Remove.
- **Stale comments**: JSDoc or inline comments that don't match current behavior. Update or remove.
- **Console.log in server code**: Remove (use audit logger for intentional logging).
- **Magic numbers/strings**: Extract to named constants.

## How to fix

1. **Extract shared helpers first** — create or update the shared module
2. **Update all call sites** — not just the changed files, but anywhere the duplicated pattern exists
3. **Verify** — run `npx tsc --noEmit` to check types still compile
4. **Report** — list what you extracted, where, and how many call sites were updated

## Output format

```
SIMPLIFIED: X issues fixed

1. [TYPE] Description
   - Extracted: what → where
   - Updated: N call sites across M files

2. [TYPE] Description
   ...

Files touched: list
Type check: pass/fail
```

If nothing to fix:
```
Code is clean. No simplification needed.
```
