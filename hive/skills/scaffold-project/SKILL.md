---
name: scaffold-project
description: Bootstrap a new full-stack project with React + Vite + Tailwind + Express + Drizzle + Neon PostgreSQL + Google OAuth. Interactive setup guide.
---

# Scaffold Project

Create a complete, production-ready full-stack application from scratch with security, shared helpers, clean architecture, and documentation built in from day one.

## Documentation Strategy

**PRD-first, types-as-contract, auto-generated output.**

This scaffold treats documentation as **input for agentic coding**, not output written after the fact. The philosophy:

1. **PRD before code.** Every project starts with a lightweight PRD (`docs/prd.md`) written in Phase A. This is the single biggest lever on output quality — an agent with a precise spec builds a precise thing.
2. **Types are the contract.** Drizzle schemas (`shared/schema.ts`) and Zod validators are machine-readable documentation. They're the code, so they can't drift. They're what the agent codes against.
3. **CLAUDE.md is the operating manual.** Written on day one, maintained as the project grows. Tells any agent how to work in this repo — conventions, rules, gotchas.
4. **API docs are auto-generated, never hand-written.** If and only if something external needs to consume the API, generate OpenAPI from Zod schemas (e.g. `@asteasolutions/zod-to-openapi`). No hand-maintained Swagger files. The type system is the source of truth.

**What we skip on purpose:** hand-written Swagger/OpenAPI specs, Swagger UI as a default, design-first spec files. These are output documentation from the pre-agent era — they add maintenance burden without improving agentic output quality. Reach for auto-generated OpenAPI only when an external consumer requires it.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui (Radix)
- **Backend**: Express + TypeScript (tsx for dev, esbuild for prod)
- **ORM**: Drizzle ORM
- **Database**: Neon PostgreSQL (dev + prod branches)
- **Auth**: Google OAuth (OIDC) with server-side PostgreSQL sessions
- **Hosting**: Vercel (static frontend + serverless API)

## Setup Flow

The setup has four phases. Complete each phase fully before moving on. Each phase ends with a checkpoint — verify before continuing.

---

### Phase A: Plan + PRD (ask the user, no tools needed)

**Write the PRD before anything else.** This is the input documentation that drives code quality in an agentic workflow. A vague prompt builds a vague thing fast; a precise PRD builds a precise thing.

Ask the user for two things in order:

#### A1. Project setup details
1. **Project name** (lowercase, kebab-case)
2. **Short description** (one sentence)
3. **Invite-only?** (default: yes)
4. **Multi-tenant?** (default: no — if yes, scaffold tenantId columns and isolation patterns)
5. **ADMIN_EMAIL** — the Google email that will be the seed admin

Note: `channel_binding=require` in Neon URLs is handled automatically by `db.ts` — never ask the user to strip it manually.

#### A2. Product Requirements Document (PRD)

Ask the user to provide (or draft with them) a lightweight PRD covering:

1. **Problem** — one paragraph: what problem does this solve, for whom?
2. **Data model** — what entities/tables are needed beyond the scaffold defaults (users, sessions, audit_logs)? Sketch the domain tables and key fields.
3. **Behaviour / acceptance criteria** — bullet points describing what the app does. Write these so they map almost 1:1 to tests. Example: "Admin can create an experiment", "Experiment has status: draft → active → archived".
4. **Constraints / non-negotiables** — security rules, UX rules, business logic rules that the agent must respect. These get written into CLAUDE.md.

Keep it tight — half a page, not a novel. The PRD is a living document; it evolves as the project does. It gets generated into `docs/prd.md` in Phase C.

**Do not proceed to Phase B until the PRD exists.** If the user says "just build it," push back gently — the PRD is non-negotiable for quality. Offer to draft it from their description and let them refine.

---

### Phase B: External services (user does in browser, you guide)

Walk the user through these in order. Collect the credentials — you'll need them in Phase C.

#### B1. Neon database
1. Go to console.neon.tech
2. Create a new project with the project name
3. Create two branches: `main` (production) and `dev` (development)
4. Copy the connection string for the `dev` branch
5. Copy the connection string for the `main` branch

Ask them to paste **both** DATABASE_URLs (dev and prod). Hold onto them for Doppler setup.

#### B2. Google OAuth
1. Go to console.cloud.google.com/apis/credentials
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add authorized JavaScript origins: `http://localhost:5000`
4. Add authorized redirect URI: `http://localhost:5000/auth/callback`
5. Copy Client ID and Client Secret

**Note:** Production origins/redirect URIs will be added in Phase D after the Vercel domain is known. Remind the user they'll need to come back here.

Ask them to paste GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.

#### B checkpoint
Confirm you have all five values: dev DATABASE_URL, prod DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL.

---

### Phase C: Generate + local dev (you do the work)

#### C1. Generate project files
Generate the full project structure (see "Project Structure" below).

Include a seed-admin script at `scripts/seed-admin.ts`:
```typescript
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

const email = process.env.ADMIN_EMAIL;
if (!email) { console.error("ADMIN_EMAIL not set"); process.exit(1); }

const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) { console.log(`User ${email} hasn't logged in yet. Log in first, then re-run.`); process.exit(0); }

await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
console.log(`${email} is now admin.`);
process.exit(0);
```

Add to package.json scripts:
```json
"seed:admin": "doppler run -- npx tsx scripts/seed-admin.ts"
```

#### C1b. Generate PRD from Phase A
Create `docs/prd.md` from the Phase A output. Use this template:

```markdown
# {Project Name}

> {Short description from Phase A}

## Problem
{One paragraph from A2}

## Data Model
Beyond scaffold defaults (users, sessions, audit_logs, invited_users, access_requests):

| Table | Purpose | Key Fields |
|-------|---------|------------|
| {table} | {purpose} | {fields} |

## Acceptance Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}
- [ ] ...

## Constraints / Non-negotiables
- {constraint 1}
- {constraint 2}
```

Also generate domain tables into `shared/schema.ts` based on the data model above, and add corresponding Zod validators where mutations occur.

#### C2. Install dependencies
```bash
npm install
```

#### C3. Doppler setup (end-to-end, project folder now exists)
Invoke the `setup-doppler` skill and walk the user through **all phases in one go**:

1. **Create Doppler project** — project name = lowercase repo name
2. **Populate `dev` environment** with the credentials from Phase B:
   - `DATABASE_URL` — dev Neon branch (the value from B1)
   - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (from B2)
   - `ADMIN_EMAIL` (from Phase A)
   - `SESSION_SECRET` — generate fresh: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `NODE_ENV` = `development`
3. **Populate `prd` environment** with production values:
   - `DATABASE_URL` — prod Neon branch (the value from B1)
   - Same `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (usually same OAuth app)
   - `ADMIN_EMAIL` (same)
   - `SESSION_SECRET` — generate a **second** fresh value (never share between envs)
   - `NODE_ENV` = `production`
4. **Install CLI** if needed (winget/scoop/manual)
5. **Login + link folder**: `doppler login` then `doppler setup` in project root
6. **Verify**: `doppler secrets` should show all variables

The npm scripts are already wired with `doppler run --` from the generated code, so there's no separate "wire Doppler into scripts" step.

#### C4. Database + first run
```bash
npm run db:push          # creates tables on dev branch
npm run dev              # starts server + client
```

#### C5. Seed admin
1. Open the app in browser, log in with Google (the ADMIN_EMAIL account)
2. Run `npm run seed:admin`
3. Refresh — admin console should now be accessible

#### C checkpoint
Verify: app runs locally, you can log in, admin console works, audit log shows your login event.

---

### Phase D: Production (can be deferred — do when ready to go live)

#### D1. Vercel project
1. Create Vercel project linked to the repo
2. Note the production domain (e.g., `my-app.vercel.app`)

#### D2. Google OAuth — add production origins
Go back to console.cloud.google.com/apis/credentials and add:
- Authorized JavaScript origin: `https://my-app.vercel.app`
- Authorized redirect URI: `https://my-app.vercel.app/auth/callback`

If using a custom domain, add that too.

#### D3. Doppler-Vercel integration
Invoke `setup-doppler` Phase 5 — connect Doppler to Vercel so production reads the `prd` secrets automatically. Do NOT manually add env vars in the Vercel dashboard.

#### D4. Production database
```bash
doppler run --config prd -- npx drizzle-kit push
```

#### D5. Deploy + verify
Push to trigger Vercel deploy. Verify the production app loads, OAuth works, and the audit log records your login.

#### D checkpoint
Verify: production app loads, OAuth works with `https://` redirect, admin console accessible, audit log recording.

## Project Structure

```
project-name/
  client/
    src/
      components/
        ui/                  # shadcn/ui primitives (button, card, etc.)
        Tabs.tsx             # Reusable underline tab component
        Stat.tsx             # Reusable stat display component
        LastUpdated.tsx      # "Updated X ago" timestamp component
        PinnedActionBar.tsx  # Sticky bottom action bar
      hooks/
        useAuth.ts           # Auth hook
      lib/
        queryClient.ts       # React Query setup
        formatters.ts        # Shared formatting helpers (money, date, percent, timeAgo)
        invalidation.ts      # Shared cache invalidation helpers
        constants.ts         # Status maps, label maps, shared config
      pages/
        Landing.tsx          # Login page
        Dashboard.tsx        # Main authenticated page
        Admin.tsx            # Admin console (full suite)
        not-found.tsx
      App.tsx
      index.css
      main.tsx
  server/
    index.ts                 # Express server setup (helmet, cors, rate limiting, trust proxy)
    api.ts                   # Vercel serverless entry point
    auth.ts                  # Google OAuth + Passport setup
    db.ts                    # Drizzle + Neon connection
    auditLog.ts              # Structured audit logging
    routes/
      index.ts               # Route registry — imports and mounts all sub-routers
      auth.ts                # Auth routes (login, callback, logout, current user)
      admin.ts               # Admin routes (users, invites, access requests, audit, security)
  shared/
    schema.ts                # Drizzle schema — the data contract
  docs/
    prd.md                   # Product Requirements Document (from Phase A)
  api/
    index.mjs                # Pre-bundled Vercel function
  .doppler.yaml
  .env.example               # Documentation of required variable names (no values)
  .gitignore
  package.json
  tsconfig.json
  vite.config.ts
  vercel.json
  drizzle.config.ts
  CLAUDE.md                  # Project guide for Claude
```

## What gets generated

### Database schema (shared/schema.ts)
- `sessions` — PostgreSQL session store
- `users` — id, email, firstName, lastName, profileImageUrl, isAdmin, termsAcceptedAt
- `audit_logs` — userId, action, resourceType, resourceId, outcome, detail, ipAddress, createdAt
- `invited_users` — email whitelist for login
- `access_requests` — name, email, cell, status for requesting access

If multi-tenant:
- `tenants` — id, name, createdAt
- All domain tables include a `tenantId` column with foreign key to tenants

### Server routes (server/routes/)

**CRITICAL: Routes are split by domain from day one.**

- **routes/index.ts**: Imports and mounts all sub-routers. This is the only file that touches `app.use()`.
- **routes/auth.ts**: Login, callback, logout, current user, terms acceptance, access requests.
- **routes/admin.ts**: User management, invites, access requests, audit logs, security overview.

As the project grows, add new route files per domain (e.g., `routes/tenant.ts`, `routes/experiments.ts`). Never let a single route file exceed 200 lines.

Each route file exports an Express Router:
```typescript
import { Router } from "express";
import { isAuthenticated } from "../auth";

const router = Router();
router.use(isAuthenticated);

// routes here...

export default router;
```

**Route handler rules:**
- Routes are plumbing only: fetch data → call logic → return result.
- No business logic inline. Calculations, filtering, validation rules, and state transitions go in pure function modules under `server/modules/`.
- Every mutation route calls `audit()` after the change.
- If multi-tenant: every route that accesses tenant data verifies ownership via middleware or explicit check.

### Server infrastructure
- **index.ts**: Express with `app.set("trust proxy", 1)`, helmet, CORS (configured for localhost + production), rate limiting (200/15min), session middleware, error sanitization.
- **api.ts**: Vercel serverless entry with same middleware.
- **auth.ts**: Google OAuth via Passport with invite-only blocking, session management, 7-day TTL.
- **db.ts**: Neon PostgreSQL connection with dev/prod branching via NODE_ENV. Strips `channel_binding=require` defensively.
- **auditLog.ts**: Fire-and-forget audit logger.

### Client shared helpers

**CRITICAL: These are scaffolded from day one to prevent duplication.**

#### `client/src/lib/formatters.ts`
```typescript
/** Format a number as currency: $1,234.56 */
export function formatMoney(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return n < 0 ? "-<$0.01" : "<$0.01";
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format money with +/- prefix */
export function formatSignedMoney(n: number): string {
  const formatted = formatMoney(n);
  return n > 0 ? `+${formatted}` : n < 0 ? `-${formatted}` : formatted;
}

/** Format as percentage: 0.85 → "85%" */
export function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Format a number with fixed decimals and optional suffix */
export function formatNumber(n: number, decimals = 1, suffix = ""): string {
  return `${n.toFixed(decimals)}${suffix}`;
}

/** Relative time: "just now", "3m ago", "2h ago", or full date */
export function formatTimeAgo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return date.toLocaleDateString();
}

/** Format a date for display */
export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString();
}
```

#### `client/src/lib/invalidation.ts`
```typescript
import { QueryClient } from "@tanstack/react-query";

// Domain-grouped invalidation helpers.
// Add new groups as domains are added to the project.
// NEVER call qc.invalidateQueries() inline in components — use these helpers.

export function invalidateAuth(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
}

export function invalidateAdmin(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/invites"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/access-requests"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/audit-logs"] });
  qc.invalidateQueries({ queryKey: ["/api/admin/security-overview"] });
}

// Add more as the project grows:
// export function invalidateTenant(qc: QueryClient) { ... }
// export function invalidateExperiments(qc: QueryClient) { ... }
```

#### `client/src/lib/constants.ts`
Shared label maps, status indicators, and configuration that would otherwise be duplicated across components.

```typescript
// Status indicators — reuse everywhere, don't redefine per component
export const STATUS_INDICATORS: Record<string, { dot: string; label: string }> = {
  active: { dot: "bg-primary animate-pulse", label: "Active" },
  paused: { dot: "bg-amber-400", label: "Paused" },
  idle: { dot: "bg-muted-foreground", label: "Idle" },
  error: { dot: "bg-red-500", label: "Error" },
};
```

### Client reusable components

**CRITICAL: These are scaffolded from day one to enforce consistent UX patterns.**

#### `client/src/components/Tabs.tsx`
Reusable underline tab component. All tabbed interfaces use this — never roll custom tab JSX.
```typescript
interface Tab {
  key: string;
  label: string;
  count?: number | null;
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-2 border-b">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key as T)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
            active === t.key
              ? "border-primary text-primary font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="ml-2 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

#### `client/src/components/Stat.tsx`
Reusable stat display. One component, used everywhere.
```typescript
export function Stat({
  label,
  value,
  size = "lg",
}: {
  label: string;
  value: string | number;
  size?: "sm" | "lg";
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-semibold", size === "lg" ? "text-2xl" : "text-lg")}>
        {value}
      </div>
    </div>
  );
}
```

#### `client/src/components/LastUpdated.tsx`
Shows when data was last fetched. Used on every data view to satisfy "date context everywhere."
```typescript
export function LastUpdated({ dataUpdatedAt }: { dataUpdatedAt: number }) {
  // dataUpdatedAt comes from React Query's query.dataUpdatedAt
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!dataUpdatedAt) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Updated {formatTimeAgo(new Date(dataUpdatedAt))}
    </span>
  );
}
```

#### `client/src/components/PinnedActionBar.tsx`
Sticky bottom action bar for scrollable pages. Primary action buttons go here, never inline at the bottom of a scrollable container.
```typescript
export function PinnedActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur px-6 py-3 flex justify-end gap-3">
      {children}
    </div>
  );
}
```

### Pre-configured routes
- `GET /api/auth/user` — current user
- `POST /api/user/accept-terms` — terms acceptance
- `POST /api/request-access` — public access request form
- `GET /api/admin/users` — admin: list users
- `PATCH /api/admin/users/:id/admin` — admin: toggle admin status
- `GET /api/admin/invites` — admin: list invites
- `POST /api/admin/invites` — admin: add invite
- `DELETE /api/admin/invites/:id` — admin: remove invite
- `GET /api/admin/access-requests` — admin: list requests
- `PATCH /api/admin/access-requests/:id` — admin: approve/decline
- `GET /api/admin/security-overview` — admin: security stats
- `GET /api/admin/audit-logs` — admin: audit log viewer

### Security (built-in from day one)
- `app.set("trust proxy", 1)` — first line after `const app = express()`
- Helmet.js security headers (CSP relaxed for dev)
- Explicit CORS policy (production domain + localhost)
- Rate limiting on all API routes
- Parameterized queries only (Drizzle ORM)
- Session cookies: httpOnly, secure, sameSite
- Error sanitization (no stack traces to client)
- Audit logging on all sensitive operations
- Invite-only access control
- Input validation with Zod on all mutations

### UX patterns (built-in from day one)

These are baked into the scaffold to prevent violations of the UX principles:

1. **Tabs component** — all tabbed interfaces use the shared `Tabs` component with underline style
2. **LastUpdated component** — every data view shows when it was last fetched
3. **PinnedActionBar** — all primary action buttons on scrollable pages use this
4. **No disabled submit buttons** — forms show amber warnings on validation issues, never disable the button. Let the user attempt submission; show errors after.
5. **Stat component** — consistent stat display everywhere
6. **Shared invalidation helpers** — mutations call helpers from `invalidation.ts`, never inline `qc.invalidateQueries()`

### npm scripts (Doppler-wrapped)
```json
{
  "dev:server": "npx tsx server/index.ts",
  "dev:client": "wait-on tcp:5000 && npx vite",
  "dev": "doppler run -- concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "build": "vite build",
  "build:api": "esbuild server/api.ts --platform=node --packages=external --bundle --format=esm --outfile=api/index.mjs",
  "db:push": "doppler run -- drizzle-kit push"
}
```
Include `wait-on` and `concurrently` as dependencies. `cross-env` is no longer needed for `NODE_ENV` (Doppler injects it from the dev/prd config), but keep it in the toolbox in case a script sets other vars.

**Do NOT generate a `.env` file.** Secrets live in Doppler. Do NOT add `dotenv` to dependencies — it's unused. The only env-adjacent file is `.env.example` (documentation of which variable names the project needs — no values).

## Optional: Auto-generated OpenAPI

**Only when an external consumer needs the API.** If the app is self-contained (frontend + backend together), skip this entirely — Zod schemas and TypeScript types are the documentation.

When needed:
1. Install `@asteasolutions/zod-to-openapi` and `swagger-ui-express`
2. Register your Zod schemas with the OpenAPI registry in a single `server/openapi.ts` file
3. Mount `GET /api/docs` (Swagger UI) and `GET /api/openapi.json` from the generated spec
4. Add a CI lint step (`redocly lint openapi.json`) to catch broken specs

The spec generates from the same Zod schemas used for validation — single source of truth, zero drift. Never hand-write or hand-edit the OpenAPI output.

## After generation

Setup is handled by Phase C and Phase D above. No separate post-generation steps needed.

## Important: Windows compatibility
- NEVER use `tsx watch` in npm scripts — it causes infinite restart loops on Windows, and VS Code terminal restore replays the loop on every editor restart. Use `npx tsx server/index.ts` (single run, no watch) instead.
- `channel_binding=require` in Neon URLs is stripped automatically by `db.ts` — never ask the user to strip it manually.
- Tailwind CSS v4 uses `@tailwindcss/vite` plugin — do NOT add `tailwindcss` to `postcss.config.js`. PostCSS config should only have `autoprefixer`, not `tailwindcss`.
- NEVER start Express and Vite simultaneously. Use `wait-on` to ensure Express is listening before Vite starts. Always include `wait-on` as a dependency. Frontend is on port 5173, API on 5000.
- `NODE_ENV` comes from Doppler — no `cross-env` wrapper needed for that, but keep `cross-env` as a dependency for other scripts that may need it.

## Conventions (written to CLAUDE.md)

The generated CLAUDE.md must include:

### Mandatory sections
1. **Project name and description** — one line
2. **Stack** — exact versions and tools
3. **Commands** — dev, build, build:api, db:push
4. **Secrets** — "Managed by Doppler. Never create a .env file."
5. **Import conventions** — server uses relative paths, client uses `@/` and `@shared/` aliases
6. **Architecture** — file structure with purpose of each directory
7. **Database** — schema overview with table purposes
8. **Routes** — list of route modules and what domain each handles
9. **Shared helpers** — list the formatter, invalidation, and constant modules; state that all new helpers go here
10. **Reusable components** — list Tabs, Stat, LastUpdated, PinnedActionBar; state that all new shared UI goes here
11. **Guiding principles** — project-specific non-negotiables (from user input)
12. **Windows quirks** — tsx no-watch, wait-on, channel_binding
13. **PRD** — "See `docs/prd.md` for what to build. The PRD is the source of truth for scope and acceptance criteria. Update it when scope changes."
14. **Documentation rules** — "Types (Drizzle + Zod) are the API contract. Never hand-write API docs. If OpenAPI is enabled, it auto-generates from Zod schemas."

### Rules to embed in generated CLAUDE.md
- "When adding a new route, create a new file in `server/routes/` — never add to an existing file that handles a different domain."
- "When formatting money, dates, percentages, or time-ago, use the helpers in `client/src/lib/formatters.ts` — never reimplement."
- "When invalidating cache after a mutation, use or extend the helpers in `client/src/lib/invalidation.ts` — never call `qc.invalidateQueries()` inline."
- "When adding tabs to a page, use the `Tabs` component — never roll custom tab JSX."
- "When showing stats, use the `Stat` component."
- "Every data view must include `<LastUpdated dataUpdatedAt={query.dataUpdatedAt} />`."
- "Action buttons on scrollable pages go in `<PinnedActionBar>`."
- "Never disable a submit button for validation. Show amber warnings after submission attempt."
- "No source file should exceed 300 lines. Split before adding."
- "After ANY server-side change, run `npm run build:api` and commit `api/index.mjs`."
- "Before adding a feature, check `docs/prd.md` — if it's not in the PRD, update the PRD first, then build."
- "Zod schemas are the single source of truth for API request/response shapes. Never duplicate them in hand-written docs."
- "CLAUDE.md is living documentation — update it whenever you add a convention, rule, or gotcha."
