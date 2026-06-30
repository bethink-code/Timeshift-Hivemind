// serve-cli: drive one governed turn against a real model, end to end (the Molo proof).
//
//   usage: tsx tools/serve-cli.ts "<the user's task>"
//   env:   ANTHROPIC_API_KEY   the native Anthropic key (sent as x-api-key); the SDK reads it
//          TIMESHIFT_AUTH_TOKEN optional — a Bearer token, for an endpoint that authenticates
//                               by Authorization: Bearer (e.g. Z.ai's ANTHROPIC_AUTH_TOKEN)
//          TIMESHIFT_MODEL     optional — model id (default Claude Opus 4.8)
//          TIMESHIFT_BASE_URL  optional — an Anthropic-compatible endpoint, e.g. Z.ai
//          TIMESHIFT_NO_THINK  optional — set to "1" to drop adaptive thinking (compat)
//          TIMESHIFT_TENANT    optional — which tenant to serve (default: the first agent)
//          TIMESHIFT_AGENT     optional — which agent under that tenant
//
//   Z.ai example (Anthropic-compatible, Bearer auth, GLM model, no thinking param):
//     TIMESHIFT_AUTH_TOKEN=<z.ai key> TIMESHIFT_BASE_URL=https://api.z.ai/api/anthropic \
//     TIMESHIFT_MODEL=glm-4.7 TIMESHIFT_NO_THINK=1 tsx tools/serve-cli.ts "<task>"
//
// The tree, the env→adapter wiring, and the serve+attest step live in server/serve-demo;
// this is just the terminal entry point onto them.

import { runServe, tenants } from "../server/serve-demo";

const task = process.argv.slice(2).join(" ").trim();
if (task === "") {
  console.error('usage: tsx tools/serve-cli.ts "<task>"');
  process.exit(2);
}

const first = tenants()[0];
const tenantId = process.env.TIMESHIFT_TENANT ?? first?.tenantId ?? "demo-tenant";
const agentId = process.env.TIMESHIFT_AGENT ?? first?.agentId ?? "benefits-counsellor";
const result = await runServe(tenantId, agentId, task);

console.log(`\nagent:    ${tenantId}/${agentId}`);
console.log(`model:    ${result.model}`);
console.log(`outcome:  ${result.outcome}${result.handoffReason ? ` (${result.handoffReason})` : ""}`);
if (result.outcome === "shipped") {
  console.log(`\n--- output ---\n${result.output ?? ""}`);
} else {
  const why = result.validation.failures.map((f) => f.key).join(", ");
  console.log(`\nwithheld — failed: ${why || "(model error)"}`);
}
console.log(`\nattested ${result.events.length} event(s) → hive/audit.jsonl`);
