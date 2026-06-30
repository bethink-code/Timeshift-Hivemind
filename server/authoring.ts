// Authoring (slice 4): create a governed agent through the engine's wizard face.
//
// A wizard is not a new artifact — it is the interview-bearing slots of a TEMPLATE projected
// per audience (buildWizard): tenant-setup surfaces the tenant's how-it-works (engine slots
// at tenant scope), agent surfaces the staff member's who-it-is (personality at agent scope).
// The answer-shape (enum / shortText / boolean), not the question, is the security control:
// every answer is checked with validateAnswer before it becomes a slot value, so a careless
// or compromised filler cannot write behaviour into a value field (Section 7). A successful
// author builds a real SlotTree and registers it in the store, so the new agent appears in
// the Serve picker — and the authoring is attested (slot.answered), never silent (P9).

import {
  buildWizard,
  isPathSafeName,
  validateAnswer,
  wizardAuthority,
  type EngineEvent,
  type SlotTree,
  type SlotValue,
  type TenantRef,
  type WizardAudience,
  type WizardQuestion,
} from "../src/index";
import { buildAgentTree, demoStore } from "./tenants";
import { FileAuditLog } from "../tools/audit-log";
import { join } from "node:path";

const DEFAULT_VOICE = "warm and plain-spoken";
const VOICE_OPTIONS: readonly string[] = [DEFAULT_VOICE, "concise and matter-of-fact", "calm and reassuring", "formal and precise"];

// The authoring template: the interview-bearing slots a new agent is cut from. defaultValue
// is only a fallback; buildWizard reads the interview, and authoring writes the answer.
const AGENT_TEMPLATE: SlotTree = {
  tenantId: "template",
  agentId: "template",
  versions: { timeshift: "v1", region: "v1", tenant: "v1", agent: "v1" },
  slots: {
    timeshift: [],
    region: [],
    tenant: [
      {
        register: "engine",
        scope: "tenant",
        kind: "fill",
        key: "behaviour.purpose",
        defaultValue: "",
        provenance: { authority: "tenant-author", version: "v1" },
        answerVersionStamp: "v1",
        interview: { question: "What is this agent for? (one sentence)", answerShape: { type: "shortText", maxLength: 200 }, required: true },
      },
    ],
    agent: [
      {
        register: "personality",
        scope: "agent",
        kind: "fill",
        key: "identity.voice",
        defaultValue: DEFAULT_VOICE,
        provenance: { authority: "agent-owner", version: "v1" },
        answerVersionStamp: "v1",
        interview: { question: "How should the agent speak?", answerShape: { type: "enum", options: VOICE_OPTIONS }, required: true },
      },
    ],
  },
};

export interface AuthoringQuestion extends WizardQuestion {
  readonly audience: WizardAudience;
  /** A short, human label for which scope/register this question authors. */
  readonly scopeLabel: string;
}

/** The full create-an-agent questionnaire: the tenant-setup and agent wizards, each question
 *  tagged with the audience it came from so the UI can show what scope it authors. */
export function authoringWizard(): readonly AuthoringQuestion[] {
  const tag = (audience: WizardAudience, scopeLabel: string) => (q: WizardQuestion): AuthoringQuestion => ({ ...q, audience, scopeLabel });
  return [
    ...buildWizard(AGENT_TEMPLATE, "tenant-setup").map(tag("tenant-setup", "tenant · how it works")),
    ...buildWizard(AGENT_TEMPLATE, "agent").map(tag("agent", "agent · who it is")),
  ];
}

export interface AuthorInput {
  readonly tenantId: string;
  readonly agentId: string;
  readonly label: string;
  readonly answers: Readonly<Record<string, SlotValue>>;
}

export type AuthorResult =
  | { readonly ok: true; readonly ref: TenantRef }
  | { readonly ok: false; readonly errors: readonly { readonly key: string; readonly reason: string }[] };

/** Validate the answers against the template's answer-shapes, then (only if every answer is
 *  acceptable and the names are path-safe and free) build and register the agent. */
export function authorAgent(input: AuthorInput, root: string = process.cwd()): AuthorResult {
  const errors: { key: string; reason: string }[] = [];

  if (!isPathSafeName(input.tenantId)) errors.push({ key: "tenantId", reason: "must be lowercase kebab-case" });
  if (!isPathSafeName(input.agentId)) errors.push({ key: "agentId", reason: "must be lowercase kebab-case" });
  if (errors.length === 0 && demoStore.loadTree(input.tenantId, input.agentId) !== undefined) {
    errors.push({ key: "agentId", reason: "an agent with this id already exists for this tenant" });
  }

  for (const q of authoringWizard()) {
    const value = input.answers[q.key];
    if (value === undefined) {
      if (q.required) errors.push({ key: q.key, reason: "required" });
      continue;
    }
    const reason = validateAnswer(q.answerShape, value); // the answer-shape boundary
    if (reason !== null) errors.push({ key: q.key, reason });
  }

  if (errors.length > 0) return { ok: false, errors };

  const purpose = String(input.answers["behaviour.purpose"]);
  const voice = String(input.answers["identity.voice"]);
  const ref: TenantRef = { tenantId: input.tenantId, agentId: input.agentId, label: input.label };
  demoStore.add(ref, buildAgentTree({ ...ref, purpose, voice, forbid: [] }));

  // Attest the authoring — nothing the engine does is silent (P9).
  const at = new Date().toISOString();
  const events: Omit<EngineEvent, "seq">[] = [
    { type: "slot.answered", tenantId: input.tenantId, at, detail: { agentId: input.agentId, key: "behaviour.purpose", authority: wizardAuthority("tenant-setup") } },
    { type: "slot.answered", tenantId: input.tenantId, at, detail: { agentId: input.agentId, key: "identity.voice", authority: wizardAuthority("agent") } },
  ];
  new FileAuditLog(join(root, "hive", "audit.jsonl")).append(events);

  return { ok: true, ref };
}
