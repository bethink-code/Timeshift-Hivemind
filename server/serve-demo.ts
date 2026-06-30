// The serve demo: one home for driving the proof-slice agent and attesting the turn.
//
// Shared by the CLI (tools/serve-cli.ts) and the Serve screen (server/index.ts) so the
// fixture tree and the env→adapter wiring live in exactly one place. Slice 2's tenant-scoped
// loadTree replaces `demoTree`; nothing else here changes.
//
// The model is configured RIGHT-OF-SEAM, from the server/CLI environment — never the
// browser, never the tenant tree: ANTHROPIC_API_KEY for native Anthropic (x-api-key), or
// TIMESHIFT_AUTH_TOKEN + TIMESHIFT_BASE_URL + TIMESHIFT_MODEL for an Anthropic-compatible
// endpoint (e.g. Z.ai, which authenticates by Bearer token). With no key set the model call
// fails and the loop hands off (fail-closed) — the demo degrades honestly, never pretends.

import { serve, type ModelAdapter, type ServeResult, type SlotTree } from "../src/index";
import { anthropicAdapter } from "../adapters/anthropic";
import { FileAuditLog } from "../tools/audit-log";
import { join } from "node:path";

/** A tiny governed agent: a plain-language benefits counsellor (engine fill at tenant scope,
 *  personality fill at agent scope) under one top-level fail-closed safety rule — never
 *  promise a guaranteed outcome. The rule both steers the prompt and validates the output. */
export const demoTree: SlotTree = {
  tenantId: "demo-tenant",
  agentId: "benefits-counsellor",
  versions: { timeshift: "v1", region: "v1", tenant: "v1", agent: "v1" },
  slots: {
    timeshift: [
      {
        register: "engine",
        scope: "timeshift",
        kind: "constraint",
        key: "safety.no-guarantees",
        steer: true,
        check: { type: "forbid-substrings", any: ["guarantee", "guaranteed"] },
        defaultValue: true,
        provenance: { authority: "platform-owner", version: "v1" },
        answerVersionStamp: "v1",
        interview: null,
      },
    ],
    region: [],
    tenant: [
      {
        register: "engine",
        scope: "tenant",
        kind: "fill",
        key: "behaviour.purpose",
        defaultValue: "Help employees understand their retirement and medical benefits in plain language.",
        provenance: { authority: "tenant-admin", version: "v1" },
        answerVersionStamp: "v1",
        interview: null,
      },
    ],
    agent: [
      {
        register: "personality",
        scope: "agent",
        kind: "fill",
        key: "identity.voice",
        defaultValue: "warm, patient, and plain-spoken",
        provenance: { authority: "tenant-admin", version: "v1" },
        answerVersionStamp: "v1",
        interview: null,
      },
    ],
  },
};

/** Build the model adapter from the environment (the right-of-seam key/provider config). */
export function adapterFromEnv(): ModelAdapter {
  return anthropicAdapter({
    ...(process.env.TIMESHIFT_AUTH_TOKEN ? { authToken: process.env.TIMESHIFT_AUTH_TOKEN } : {}),
    ...(process.env.TIMESHIFT_MODEL ? { model: process.env.TIMESHIFT_MODEL } : {}),
    ...(process.env.TIMESHIFT_BASE_URL ? { baseURL: process.env.TIMESHIFT_BASE_URL } : {}),
    ...(process.env.TIMESHIFT_NO_THINK === "1" ? { adaptiveThinking: false } : {}),
  });
}

/** Drive one governed turn over the demo tree and append its attestation to the audit log.
 *  The single place serve + attest happens, so the CLI and the Serve screen agree. */
export async function runServe(task: string, root: string = process.cwd()): Promise<ServeResult> {
  const at = new Date().toISOString();
  const result = await serve({ tree: demoTree, task, adapter: adapterFromEnv(), at, context: { handoffAvailable: true } });
  new FileAuditLog(join(root, "hive", "audit.jsonl")).append(result.events);
  return result;
}
