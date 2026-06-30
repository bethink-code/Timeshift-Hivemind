// The serve demo: one home for driving a governed agent and attesting the turn.
//
// Shared by the CLI (tools/serve-cli.ts) and the Serve screen (server/index.ts). The tenant
// trees come from a TreeStore (server/tenants.ts) — slice 2's seam — so this no longer holds
// a single hard-coded tree; a Drizzle/Neon store later replaces the in-memory one unchanged.
//
// The model is configured RIGHT-OF-SEAM, from the server/CLI environment — never the
// browser, never the tenant tree: ANTHROPIC_API_KEY for native Anthropic (x-api-key), or
// TIMESHIFT_AUTH_TOKEN + TIMESHIFT_BASE_URL + TIMESHIFT_MODEL for an Anthropic-compatible
// endpoint (e.g. Z.ai, Bearer auth). With no key set the model call fails and the loop hands
// off (fail-closed) — the demo degrades honestly, never pretends.

import { serve, type ModelAdapter, type ServeResult, type TenantRef } from "../src/index";
import { anthropicAdapter } from "../adapters/anthropic";
import { FileAuditLog } from "../tools/audit-log";
import { demoStore } from "./tenants";
import { join } from "node:path";

/** The agents the demo store can serve (for a picker). */
export function tenants(): readonly TenantRef[] {
  return demoStore.tenants();
}

/** Build the model adapter from the environment (the right-of-seam key/provider config). */
export function adapterFromEnv(): ModelAdapter {
  return anthropicAdapter({
    ...(process.env.TIMESHIFT_AUTH_TOKEN ? { authToken: process.env.TIMESHIFT_AUTH_TOKEN } : {}),
    ...(process.env.TIMESHIFT_MODEL ? { model: process.env.TIMESHIFT_MODEL } : {}),
    ...(process.env.TIMESHIFT_BASE_URL ? { baseURL: process.env.TIMESHIFT_BASE_URL } : {}),
    ...(process.env.TIMESHIFT_NO_THINK === "1" ? { adaptiveThinking: false } : {}),
  });
}

/** Drive one governed turn over a tenant's agent and append its attestation to the audit
 *  log. The single place serve + attest happens, so the CLI and the Serve screen agree.
 *  Throws "unknown agent: …" if the store holds no such (tenant, agent). */
export async function runServe(tenantId: string, agentId: string, task: string, root: string = process.cwd()): Promise<ServeResult> {
  const tree = demoStore.loadTree(tenantId, agentId);
  if (tree === undefined) throw new Error(`unknown agent: ${tenantId}/${agentId}`);
  const at = new Date().toISOString();
  const result = await serve({ tree, task, adapter: adapterFromEnv(), at, context: { handoffAvailable: true } });
  new FileAuditLog(join(root, "hive", "audit.jsonl")).append(result.events);
  return result;
}
