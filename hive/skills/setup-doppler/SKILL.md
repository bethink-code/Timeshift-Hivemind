---
name: setup-doppler
description: Set up Doppler as the secret store for a project — create Doppler project, populate dev + prd environments, install CLI, wire into npm scripts, connect Vercel integration, and delete the .env file. Use when adopting Doppler for a new or existing project, or when onboarding a new machine.
---

# Setup Doppler

Doppler is the secret store for all projects. Local dev reads secrets via `doppler run`, production reads them via the Doppler–Vercel integration. No `.env` files on disk anywhere — ever.

This skill walks the user through the full setup interactively. It is NOT automated — the user must do the Doppler dashboard and Neon dashboard steps themselves, but you guide them, verify each step, and do the file edits.

## Deployment order (Railway + Vercel + GitHub)

When deploying a new project to Railway + Vercel, Doppler is step 2 of 6. The full order is:

1. **GitHub** — push repo (Railway and Vercel both connect from here)
2. **Doppler** — create project, populate `dev` fully, populate `prd` partially (skip `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN` — you don't have those values yet)
3. **Railway** — engine + Postgres + Redis. Use `${{Postgres.DATABASE_URL}}` and `${{Redis.REDIS_URL}}` references. Note the engine's public URL.
4. **Vercel** — import repo, set `VITE_ENGINE_URL` = Railway engine URL, deploy. Note the Vercel URL.
5. **Doppler → Vercel sync** — Config Syncs in Doppler prd (Vercel project must exist first)
6. **Wire CORS** — add `CORS_ORIGIN` = Vercel URL to Railway engine Variables, redeploy

Skipping this order causes: API calls 404 (no VITE_ENGINE_URL), sync dialog has no project to select (Vercel not yet created), CORS failures (CORS_ORIGIN set in Doppler but not in Railway).

---

## When to use

- Adopting Doppler on an existing project (like we did for myCanary)
- Scaffolding a new project (called from `scaffold-project` after Neon + Google OAuth credentials exist)
- Onboarding a new machine (skip to Phase 3)

## Prerequisites

Before starting, verify the user has:
- A Doppler account (free at doppler.com — sign up with Google)
- The secrets already gathered from their source systems (Neon connection strings, Google OAuth client ID/secret, Xero keys, etc.)
- Windows: admin ability to edit PATH (for first-time CLI install)

## Phase 1 — Create Doppler project and populate secrets

### Step 1.1 — Create the project in Doppler dashboard

Tell the user:
1. Go to **dashboard.doppler.com**
2. Click **+ Create Project** (top right)
3. Project name: **lowercase, matching the repo folder name** (e.g. `mycanary`, not `MyCanary`)
4. Leave default environments: `dev`, `stg`, `prd` — we'll only use `dev` and `prd` for now

### Step 1.2 — Populate the `dev` environment

The user will manually paste each secret. Guide them:

1. Click into the **`dev`** environment (top nav dropdown)
2. For each secret their project needs, click **+ Add Secret**:
   - Name: the env var name exactly as the code expects (`DATABASE_URL`, not `DEV_DATABASE_URL`)
   - Value: the dev value (dev Neon branch, dev OAuth app, etc.)
3. Click **Save** (top right) — the button only enables when there are unsaved changes

**Common secrets to add** (adjust for the specific project):
- `DATABASE_URL` — Neon dev branch connection string
- `SESSION_SECRET` — **generate a new random one, see Step 1.4**
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — OAuth credentials
- `NODE_ENV` — `development`
- Any third-party API keys the project uses (Xero, Stripe, Google Sheets ID, etc.)

### Step 1.3 — Populate the `prd` environment

1. Switch the environment dropdown to **`prd`**
2. Add the **same variable names** with **production values**:
   - `DATABASE_URL` — prod Neon branch connection string (DIFFERENT value, SAME name)
   - `SESSION_SECRET` — a **second** freshly generated random value (never share between envs)
   - `NODE_ENV` — `production`
   - Production OAuth credentials if they differ (often the same OAuth app works for both)

### Step 1.4 — Generate real SESSION_SECRETs

**Critical**: don't let the user use placeholder values. For every environment, run this in any terminal to generate a real random secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Produces a 128-character hex string. Paste that into Doppler's SESSION_SECRET. Run it **twice** — once for dev, once for prd. Never share session secrets between environments.

### Step 1.5 — CRITICAL naming rule

**Same variable name across environments. Different values per environment.**

❌ WRONG: `DATABASE_URL` in dev, `DATABASE_URL_PRODUCTION` in prd  
✅ RIGHT: `DATABASE_URL` in dev, `DATABASE_URL` in prd (same name, different value)

This is the #1 mistake. The whole point of Doppler environments is that the code reads `process.env.DATABASE_URL` and Doppler injects the right value based on which environment you ran with. If the names differ, the code would need branching (`NODE_ENV === 'production' ? ... : ...`) which defeats the entire purpose.

Verify this explicitly by having the user scan both environments and confirm variable names match exactly.

### Step 1.6 — Validate Postgres URL format

Before moving on, verify `DATABASE_URL` in both environments has the correct shape:

```
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
                         ^
                   MUST have @ between password and host
```

Common mistakes to look for (we hit all of these once):
- Missing `@` separator (shows as a dash or nothing between password and host)
- Doubled `npg_` prefix on password (`npg_npg_...`) — happens when pasting a new password on top of an old one
- Missing `ep-` prefix on the host (`ep-jolly-fire-...`, not just `jolly-fire-...`)
- Neon only shows a password **once** — if the user lost it, they must click **Reset Password** in Neon again to see it

Verify with: `doppler run -- node -e "console.log(new URL(process.env.DATABASE_URL).hostname)"` — if the URL is malformed, this throws.

## Phase 2 — Install the Doppler CLI (Windows)

Check if already installed: `doppler --version`. If it prints a version, skip to Phase 3.

### Step 2.1 — Install via winget (preferred)

```bash
winget install doppler.doppler
```

Or scoop:
```bash
scoop install doppler
```

If both fail (corporate restrictions, etc.), fall back to manual install:

### Step 2.2 — Manual install (zip download)

1. Download the Windows zip from **github.com/DopplerHQ/cli/releases** (latest release, `doppler_X.Y.Z_windows_amd64.zip`)
2. Extract the zip — it contains only `doppler.exe` (no installer)
3. Move `doppler.exe` to a permanent location on PATH. Preferred target: `C:\Users\<username>\bin\`
   ```bash
   mkdir -p "/c/Users/<username>/bin"
   mv "/c/Users/<username>/Downloads/doppler_*/doppler.exe" "/c/Users/<username>/bin/"
   ```

### Step 2.3 — Add ~/bin to PATH (if using manual install)

Guide the user:
1. Win+R → `sysdm.cpl` → Enter
2. **Advanced** tab → **Environment Variables...**
3. **Top section** ("User variables for <username>") — find the existing `Path` entry
4. **Select `Path` → click `Edit...`** (NOT the `New...` button at the top — that creates a second variable)
5. In the Edit window, click **New** → paste `C:\Users\<username>\bin` → Enter
6. OK → OK → OK
7. **Close every open terminal AND restart VS Code completely** (File → Exit, then reopen)

**Why the VS Code restart matters**: VS Code terminals inherit the PATH from the VS Code process, which was started before the PATH change. Just closing the terminal panel isn't enough. Verify with:
```bash
doppler --version
```

### Step 2.4 — Troubleshooting the "Path doesn't exist in user variables" case

If the user opens the User Variables list and there's no `Path` entry (rare but possible on fresh installs):
- They legitimately need to click `New...` and create one with name `Path` and value `C:\Users\<username>\bin`
- Windows will automatically merge user Path with system Path

## Phase 3 — Authenticate and link the project

### Step 3.1 — Login

```bash
doppler login
```

What happens:
- CLI prints an auth code and copies it to clipboard
- Opens browser to an auth page
- User pastes code, clicks Next, then Authorize
- Terminal shows `Welcome, <name>!`

### Step 3.2 — Link the project folder

In the project root:
```bash
doppler setup
```

Interactive prompts:
- **Select a project**: choose the one created in Phase 1 (e.g. `mycanary`)
- **Select a config**: choose `dev`

The selection is stored in `.doppler.yaml` in the project folder (safe to commit — it contains only project/config names, no secrets).

### Step 3.3 — Verify secrets are readable

```bash
doppler secrets
```

Should print a table of all secrets with their names visible (values masked unless `--plain` is passed).

Then verify injection works end-to-end:
```bash
doppler run -- node -e "console.log('DB:', process.env.DATABASE_URL?.slice(0,30))"
```

Should print something like `DB: postgresql://neondb_owner:npg_`. If you get `undefined` or an error, the secret isn't set correctly or Doppler isn't linked.

## Phase 4 — Wire Doppler into npm scripts

### Step 4.1 — Read current package.json scripts

Use the Read tool to see the existing scripts.

### Step 4.2 — Edit package.json

The rule: **only scripts that need secrets get wrapped in `doppler run --`**. Other scripts stay as-is.

**Typical changes** (adjust to the project's actual scripts):

```json
{
  "scripts": {
    "dev:server": "npx tsx server/index.ts",
    "dev:client": "wait-on tcp:5000 && npx vite",
    "dev": "doppler run -- concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build": "vite build",
    "build:api": "esbuild server/api.ts --platform=node --packages=external --bundle --format=esm --outfile=api/index.mjs",
    "db:push": "doppler run -- drizzle-kit push"
  }
}
```

Key changes:
- `dev` — wrap with `doppler run --`. The child processes (server + client) inherit the injected env vars automatically
- `db:push` — wrap with `doppler run --` (needs DATABASE_URL)
- `dev:server` — **remove `cross-env NODE_ENV=development`**. Doppler injects `NODE_ENV=development` from the dev config, making cross-env redundant here. Keep `cross-env` as a package dependency — other scripts may use it.
- `build` and `build:api` — leave alone. Vercel injects env vars during production builds, and local builds rarely need them. For the rare case a local prod build is needed, run it as: `doppler run --config prd -- npm run build`

### Step 4.3 — Test `npm run dev`

```bash
npm run dev
```

Watch for:
- ✅ Server starts on its expected port with no "DATABASE_URL undefined" errors
- ✅ Client Vite server starts
- ✅ App loads in browser

If the server fails with a Postgres URL parsing error, go back and validate the URL format (Phase 1 Step 1.6).

### Step 4.4 — Delete the `.env` file

**Only after Step 4.3 passes.** Then:

```bash
rm .env
```

Verify `.env` is already in `.gitignore` (it should be from scaffold). If the project has an `.env.example`, leave it — it serves as documentation of which variables the project needs.

## Phase 5 — Connect Doppler to Vercel

This is the piece that makes prod deploys pick up secrets automatically.

### Step 5.1 — In the Doppler dashboard

1. Open the project
2. Click **Integrations** (or **Config Syncs** depending on UI version)
3. Click **+ Add Sync** → choose **Vercel**
4. OAuth to Vercel — authorize Doppler to access your Vercel account
5. Pick the Vercel project to sync to
6. Map Doppler environments to Vercel environments:
   - Doppler `prd` → Vercel `Production`
   - Doppler `dev` → Vercel `Preview` (optional, usually unused)
7. Click **Sync**

### Step 5.2 — Verify the sync

1. Go to the Vercel dashboard → project → Settings → Environment Variables
2. Confirm all the `prd` secrets from Doppler are there
3. They'll be marked as managed by Doppler (you shouldn't edit them in Vercel directly)

### Step 5.3 — Trigger a deploy

Push a commit or click Redeploy in Vercel. The build should now read secrets from Doppler via the sync. Verify by checking the deployed app actually connects to the prod DB.

## Phase 6 — Document it in the project

Add this one-liner to the project's CLAUDE.md under "Commands" or "Conventions":

```markdown
## Secrets
Managed by Doppler. `npm run dev` auto-injects via `doppler run`.
To access prod secrets temporarily: `doppler run --config prd -- <command>`
Never create a `.env` file in this project.
```

## Common pitfalls (all hit during the myCanary setup)

1. **Putting `DATABASE_URL_PRODUCTION` in the dev environment** — wrong shape. Same name across envs, different values.
2. **SESSION_SECRET = "change-in-production-placeholder"** — always generate a real random value before Save.
3. **Malformed Postgres URL** (missing `@`, doubled `npg_` prefix, missing `ep-` on host) — always validate with `new URL()` before moving on.
4. **VS Code terminals not seeing PATH update** — needs a full VS Code restart, not just a new terminal panel.
5. **Creating a new `Path` variable instead of editing the existing one** — always click Edit on the existing entry.
6. **Forgetting to delete `.env` after migration** — leaves a secrets-on-disk hazard even though the code now uses Doppler.
7. **Forgetting the Vercel integration** — without it, prod has no secrets and deploys break.
8. **Rotating a Neon password and losing the new value** — Neon only shows it once. If lost, Reset Password again.
9. **Running `doppler run` from a subfolder that isn't linked** — `doppler setup` is folder-scoped. Run it from the project root.
10. **Committing `.doppler.yaml`** — this is safe to commit (only contains project/config names). Committing it makes `doppler setup` auto-select the right config on other machines. DO commit it.
11. **`doppler run --` in Railway start/deploy commands** — Railway does NOT have the Doppler CLI installed. If a root `package.json` script has `doppler run --` in it and `railway.toml` calls that script (e.g. `pnpm db:migrate`), the deploy crashes with `sh: 1: doppler: not found`. Fix: in `railway.toml`, call the *package-level* script directly to bypass the doppler prefix: `pnpm --filter @qalisa/db db:migrate` instead of `pnpm db:migrate`. Railway injects env vars natively — no doppler needed there.

## Quick reference for future sessions

Once set up, the daily workflow has ZERO friction:

```bash
npm run dev              # auto-injects dev secrets
npm run db:push          # auto-injects dev secrets
doppler secrets          # view all secrets for current env
doppler secrets set KEY=value   # add/update a secret via CLI
doppler run --config prd -- npm run build    # one-off prod build locally
git push                 # Vercel deploys with prod secrets from Doppler sync
```

To rotate a secret:
1. Update it in Doppler dashboard → Save
2. Local dev picks it up next time `npm run dev` starts
3. Production picks it up within ~10 seconds via the Vercel sync
4. No code changes, no redeploy needed
