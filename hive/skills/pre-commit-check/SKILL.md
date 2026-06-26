---
name: pre-commit-check
description: Quick pre-commit quality gate. Scans staged files for secrets, debug code, security issues, structural drift, and common mistakes before committing.
---

# Pre-Commit Check

Fast scan of staged or recently changed files before committing. This is a quick gate, not a deep review. Catches the obvious things that should never be committed.

## What to scan

Run `git diff --cached --name-only` for staged files. If nothing staged, use `git diff --name-only` for unstaged changes. Read each file.

## Checks (all enforced — block commit if found)

### 1. Secrets and credentials
Scan for patterns that indicate hardcoded secrets:
- API keys: `sk-`, `sk_live_`, `sk_test_`, `api_key`, `apiKey`
- AWS: `AKIA`, `aws_secret`
- Database URLs with credentials: `postgresql://.*:.*@`
- Private keys: `-----BEGIN.*PRIVATE KEY-----`
- Tokens: `ghp_`, `gho_`, `github_pat_`, `xoxb-`, `xoxp-`
- Generic: `password = "`, `secret = "`, `token = "`

**Exception**: `.env.example` files with placeholder values are OK.

### 2. Debug code
- `console.log` in server-side route handlers (use audit logger instead)
- `debugger` statements
- `alert()` in production components
- `TODO` or `FIXME` without a ticket reference (flag but don't block)

### 3. Security red flags
- `eval(` or `new Function(`
- `innerHTML` or `dangerouslySetInnerHTML` with user input
- SQL string concatenation (`query(\`` + ` or `"SELECT * FROM " +`)
- `child_process.exec` with template literals containing variables
- `.env` file being committed (should be gitignored)

### 4. Common mistakes
- `console.error` that exposes error details in response: `res.json({ error: err.message })`
- Missing `await` on async function calls in route handlers
- `any` type on request handlers without proper casting
- Import from `@shared/` in server files (should use relative paths)
- Committed `node_modules` or `.env`

### 5. File checks
- Files larger than 1MB being committed (likely binary or generated)
- `api/index.mjs` not updated after server changes (reminder to run `npm run build:api`)

### 6. Structural drift (warn — don't block, but flag prominently)
- **File over 300 lines**: Flag any source file (.ts, .tsx) over 300 lines with a warning: "This file is N lines — consider splitting before it grows further."
- **Duplicate function names**: If a function defined in a changed file has the same name as a function in another file (search with grep), flag: "Function `X` also exists in `other-file.ts` — should this be a shared helper?"
- **Inline `qc.invalidateQueries()`**: If a changed client file calls `qc.invalidateQueries()` directly instead of using a helper from `lib/invalidation.ts`, flag: "Use shared invalidation helpers instead of inline calls."
- **Inline formatting**: If a changed file defines `fmtMoney`, `formatMoney`, `toLocaleString` with currency options, `Math.round(n * 100) + "%"`, or similar — flag: "Use shared formatters from `lib/formatters.ts`."

## Output

If issues found:
```
BLOCKED: X issues must be fixed before committing
WARNINGS: Y structural issues to address

[BLOCK] file.ts:LINE — Description
  Fix: What to change

[WARN] file.ts — Description
  Suggestion: What to consider

Commit blocked. Fix the BLOCK issues and try again.
Warnings won't block the commit but should be addressed soon.
```

If clean:
```
Pre-commit check passed. All clear to commit.
```

## Speed

This skill should complete in under 10 seconds. Don't read files that weren't changed. Don't run npm audit or other slow operations — that's for `/code-review`.
