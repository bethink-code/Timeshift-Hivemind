---
name: code-review
description: Deep code review of recent changes. Checks for quality, reuse, efficiency, security anti-patterns, structural health, and UX principle violations. Enforces fixes.
---

# Code Review

Perform a thorough review of recently changed code. This is a deep analysis, not a quick lint. Focus on correctness, security, maintainability, reuse, structural health, and UX compliance.

## How to find what changed

1. Run `git diff --name-only HEAD~1` to find recently changed files
2. If no recent commits, run `git diff --name-only` for unstaged changes
3. Read each changed file in full (not just the diff) to understand context

## Review checklist

### Security (Critical — enforce fixes)
- SQL injection: string concatenation in queries
- Missing auth middleware on API routes
- Missing ownership checks on user-scoped data
- Hardcoded secrets or credentials
- Unsanitized user input in file paths, shell commands, or HTML
- Raw error details sent to clients

### Correctness (High — enforce fixes)
- Logic errors: off-by-one, wrong comparison operators, missing null checks
- Async/await: missing await, unhandled promise rejections, race conditions
- Type safety: `any` types that hide bugs, incorrect type assertions
- Edge cases: empty arrays, null/undefined, zero values, negative numbers
- Error handling: empty catch blocks, swallowed errors, missing error responses

### Reuse (High — enforce fixes)
- Duplicated code that should be extracted to a shared function
- Reimplemented logic that already exists elsewhere in the codebase (search for it)
- New utility functions that duplicate existing npm packages already in dependencies
- Copy-pasted database queries that should use the storage layer
- **Formatting helpers reimplemented**: money, date, percentage, timeAgo formatting should use `client/src/lib/formatters.ts` — never redefine inline
- **Cache invalidation scattered**: `qc.invalidateQueries()` called inline instead of using helpers from `client/src/lib/invalidation.ts`
- **Tab JSX reimplemented**: custom tab rendering instead of using the shared `Tabs` component
- **Stat display reimplemented**: custom stat blocks instead of using the shared `Stat` component
- **Status/label maps duplicated**: regime labels, mood indicators, or other lookup maps defined in multiple files instead of `client/src/lib/constants.ts`

### Structure (High — enforce fixes)
- **File size**: Any source file exceeding 300 lines must be split. Flag the file and suggest how to decompose it.
- **Monolithic routes**: All routes in a single file instead of split by domain into `server/routes/`. If a route file handles more than one domain, flag it.
- **Business logic in routes**: Route handlers containing calculations, filtering, sorting, validation rules, or state transition logic inline. Routes are plumbing — logic goes in pure function modules.
- **Storage without tenant isolation**: Storage functions that update/delete by record ID without including a tenantId WHERE clause (when the table has a tenantId column).
- **Missing audit logging**: Mutation endpoints (POST/PATCH/DELETE) that don't call `audit()` after the change.

### UX Principles (Medium — enforce fixes)
- **Disabled submit buttons**: Forms that disable the submit button based on validation state. Should show amber warnings after submission attempt instead.
- **Missing "last updated"**: Data views that don't show when the data was last fetched. Should use `<LastUpdated>` component.
- **Unpinned action buttons**: Primary action buttons on scrollable pages that aren't in a `<PinnedActionBar>` or `position: sticky` container.
- **Developer language in labels**: "fetch", "loading", "error" instead of business language. Labels should reflect how the user thinks about it.
- **Inconsistent tab styling**: Tabs using pills, toggles, or custom JSX instead of the shared underline `Tabs` component.

### Efficiency (Medium — advise)
- N+1 database queries in loops (should batch or join)
- Loading entire datasets when only a count or subset is needed
- Missing database indexes for frequently queried columns
- Unnecessary re-renders in React components (missing memo, unstable references)
- Large objects in component state that should be in React Query cache

### Maintainability (Low — advise)
- Functions longer than 50 lines that should be broken down
- Deeply nested conditionals (>3 levels) that could be early-returned
- Magic numbers or strings that should be named constants
- Inconsistent patterns compared to the rest of the codebase

## What NOT to review
- Code style, formatting, or whitespace (leave to prettier/eslint)
- Documentation or comments (unless misleading)
- Test files (unless they test the wrong thing)
- Generated files (api/index.mjs, lock files)

## Output format

For each issue:
```
[SEVERITY] file.ts:LINE — Brief description
  Problem: What's wrong
  Fix: What to do (or apply it directly for Critical/High)
```

For Critical and High issues: apply the fix immediately.
For Medium and Low: explain and suggest but don't change without asking.

End with a summary:
- Total issues: X critical, Y high, Z medium, W low
- Files reviewed: list
- Overall assessment: one sentence
- **Structural health**: one sentence on file sizes, route organization, and helper reuse
