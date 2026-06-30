// serve-cli: drive one governed turn against a real model, end to end (the Molo proof).
//
//   usage: tsx tools/serve-cli.ts "<the user's task>"
//   env:   ANTHROPIC_API_KEY   the native Anthropic key (sent as x-api-key); the SDK reads it
//          TIMESHIFT_AUTH_TOKEN optional — a Bearer token, for an endpoint that authenticates
//                               by Authorization: Bearer (e.g. Z.ai's ANTHROPIC_AUTH_TOKEN)
//          TIMESHIFT_MODEL     optional — model id (default Claude Opus 4.8)
//          TIMESHIFT_BASE_URL  optional — an Anthropic-compatible endpoint, e.g. Z.ai
//          TIMESHIFT_NO_THINK  optional — set to "1" to drop adaptive thinking (compat)
//
//   Z.ai example (Anthropic-compatible, Bearer auth, GLM model, no thinking param):
//     TIMESHIFT_AUTH_TOKEN=<z.ai key> TIMESHIFT_BASE_URL=https://api.z.ai/api/anthropic \
//     TIMESHIFT_MODEL=glm-4.7 TIMESHIFT_NO_THINK=1 tsx tools/serve-cli.ts "<task>"
//
// This is the live EDGE of the serve loop. A hard-coded fixture tenant tree (the backbone's
// tenant-scoped loadTree replaces it in slice 2) → resolve → render → CALL THE MODEL →
// validate the output → ship or hand off (fail-closed) → append the attestation events to
// hive/audit.jsonl, the same substrate the materialiser and onboarding already write to.

import { serve, type SlotTree } from "../src/index";
import { anthropicAdapter } from "../adapters/anthropic";
import { FileAuditLog } from "./audit-log";
import { join } from "node:path";

const task = process.argv.slice(2).join(" ").trim();
if (task === "") {
  console.error('usage: tsx tools/serve-cli.ts "<task>"');
  process.exit(2);
}

// A tiny governed agent: a plain-language benefits counsellor (engine fill at tenant scope,
// personality fill at agent scope) under one top-level fail-closed safety rule — never
// promise a guaranteed outcome. The rule both steers the prompt and validates the output.
const tree: SlotTree = {
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

const adapter = anthropicAdapter({
  ...(process.env.TIMESHIFT_AUTH_TOKEN ? { authToken: process.env.TIMESHIFT_AUTH_TOKEN } : {}),
  ...(process.env.TIMESHIFT_MODEL ? { model: process.env.TIMESHIFT_MODEL } : {}),
  ...(process.env.TIMESHIFT_BASE_URL ? { baseURL: process.env.TIMESHIFT_BASE_URL } : {}),
  ...(process.env.TIMESHIFT_NO_THINK === "1" ? { adaptiveThinking: false } : {}),
});

const at = new Date().toISOString();
const result = await serve({ tree, task, adapter, at, context: { handoffAvailable: true } });

console.log(`\nmodel:    ${result.model}`);
console.log(`outcome:  ${result.outcome}${result.handoffReason ? ` (${result.handoffReason})` : ""}`);
if (result.outcome === "shipped") {
  console.log(`\n--- output ---\n${result.output ?? ""}`);
} else {
  const why = result.validation.failures.map((f) => f.key).join(", ");
  console.log(`\nwithheld — failed: ${why || "(model error)"}`);
}

const log = new FileAuditLog(join(process.cwd(), "hive", "audit.jsonl"));
log.append(result.events);
console.log(`\nattested ${result.events.length} event(s) → hive/audit.jsonl`);
