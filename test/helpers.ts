// Shared test builders. Register-correct slot factories and a tree assembler, so each
// test states only what it is exercising. Kept in one place: the same factories were
// drifting across four test files.

import {
  resolve,
  type ComplianceSlot,
  type EngineSlot,
  type Interview,
  type PersonalitySlot,
  type ResolvedKey,
  type Scope,
  type Skill,
  type SkillsByScope,
  type Slot,
  type SlotTree,
} from "../src/index";

export const prov = (authority: string) => ({ authority, version: "v1" });

export function treeOf(partial: Partial<Record<Scope, Slot[]>> & { skills?: SkillsByScope }): SlotTree {
  return {
    tenantId: "tenant-acme",
    agentId: "agent-1",
    versions: { timeshift: "v1", region: "v1", tenant: "v1", agent: "v1" },
    slots: {
      timeshift: partial.timeshift ?? [],
      region: partial.region ?? [],
      tenant: partial.tenant ?? [],
      agent: partial.agent ?? [],
    },
    ...(partial.skills ? { skills: partial.skills } : {}),
  };
}

type WithInterview = { interview?: Interview | null };

export const engine = (s: Omit<EngineSlot, "register" | "provenance" | "answerVersionStamp" | "interview"> & WithInterview): EngineSlot =>
  ({ register: "engine", provenance: prov("author"), answerVersionStamp: "v1", interview: null, ...s });

export const compliance = (s: Omit<ComplianceSlot, "register" | "scope" | "behaviour" | "provenance" | "answerVersionStamp" | "interview"> & WithInterview): ComplianceSlot =>
  ({ register: "compliance", scope: "region", behaviour: "mandate", provenance: prov("regulator"), answerVersionStamp: "v1", interview: null, ...s });

export const personality = (s: Omit<PersonalitySlot, "register" | "scope" | "kind" | "provenance" | "answerVersionStamp" | "interview"> & WithInterview): PersonalitySlot =>
  ({ register: "personality", scope: "agent", kind: "fill", provenance: prov("agent-owner"), answerVersionStamp: "v1", interview: null, ...s });

export const skill = (name: string): Skill => ({ name, description: `does ${name}`, body: `BODY:${name}` });

/** Resolve a tree and pull one key out, asserting it exists. */
export function keyOf(tree: SlotTree, key: string): ResolvedKey {
  const k = resolve(tree).keys.find((r) => r.key === key);
  if (!k) throw new Error(`key ${key} not resolved`);
  return k;
}
