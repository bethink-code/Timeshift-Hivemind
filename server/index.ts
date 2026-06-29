// TimeShift Hivemind interface — a lightweight Express shell over the engine.
//
// Read endpoints project what the engine already computes (the estate scan, the admit
// proposal); the one write endpoint applies only human-confirmed decisions. No auth yet
// (local dev): the Admit screen sends an "acting as" principal (id/tenant/role), and the
// engine's authority gate enforces role and tenant on it, so the routing-up and
// tenant-isolation behaviour is visible even before real logins.
//
// TRUST BOUNDARY: taking the principal from the request body is a DEMO shortcut. A real
// deployment derives it from the authenticated session and never trusts a client-supplied
// role or tenant — otherwise any client could claim platform-owner. The verification is an
// edge/adapter job; the core only ever enforces authorisation on an already-verified one.

import express from "express";
import { join } from "node:path";
import { readHive } from "../tools/materialize";
import type { AdmitScope, Decision } from "../tools/admit";
import type { Principal, Role } from "../src/index";
import { assembleEstate } from "./estate";
import { acceptOnboarding, buildOnboarding } from "./onboard";

const root = process.cwd();
const hiveDir = join(root, "hive");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(join(root, "server", "public")));

app.get("/api/estate", (_req, res) => {
  res.json(assembleEstate(root));
});

app.get("/api/hive", (_req, res) => {
  const skills = readHive(hiveDir).map((s) => ({ name: s.name, scope: s.scope, project: s.project ?? null, description: s.description }));
  res.json(skills);
});

app.get("/api/admit/onboard-proposal", (_req, res) => {
  res.json(buildOnboarding(root).proposals);
});

app.post("/api/admit/accept", (req, res) => {
  const decisions = parseDecisions(req.body);
  res.json(acceptOnboarding(root, decisions));
});

const port = Number(process.env.PORT ?? 5000);
app.listen(port, () => process.stdout.write(`TimeShift Hivemind on http://localhost:${port}\n`));

// Validate the request body at the boundary; never trust the shape (Security by Default).
function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}

function isScope(v: unknown): v is AdmitScope {
  return v === "timeshift" || v === "tenant" || v === "agent";
}

function isRole(v: unknown): v is Role {
  return v === "platform-owner" || v === "tenant-admin" || v === "staff";
}

/** Parse the "acting as" principal. DEMO ONLY (see the trust-boundary note above): a real
 *  deployment reads this from the session, never the body. */
function parsePrincipal(v: unknown): Principal | undefined {
  const o = asRecord(v);
  if (!o || typeof o.id !== "string" || typeof o.tenant !== "string" || !isRole(o.role)) return undefined;
  return { id: o.id, tenant: o.tenant, role: o.role };
}

function parseDecisions(body: unknown): Decision[] {
  const list = asRecord(body)?.decisions;
  if (!Array.isArray(list)) return [];
  const out: Decision[] = [];
  for (const item of list) {
    const o = asRecord(item);
    const by = parsePrincipal(o?.by);
    if (!o || typeof o.name !== "string" || !isScope(o.scope) || !by) continue;
    out.push({
      name: o.name,
      scope: o.scope,
      accept: o.accept === true,
      by,
      ...(typeof o.project === "string" ? { project: o.project } : {}),
      ...(typeof o.reason === "string" ? { reason: o.reason } : {}),
    });
  }
  return out;
}
