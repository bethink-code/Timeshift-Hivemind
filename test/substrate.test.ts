// Phase 0 verification (Goal-Driven Execution).
//
// The goal is not "the types compile" but two observable properties:
//   1. The four worked examples from Section 5, one per scope, round-trip into a
//      well-formed SlotTree, and the encoded laws (L7, L9) hold by construction.
//   2. The provenance log is append-only as a *structural* fact: there is no path
//      to mutate a recorded entry, and a read snapshot cannot reach back into it.

import { describe, expect, it } from "vitest";
import {
  AppendOnlyLog,
  SCOPE_ORDER,
  slotInvariants,
  type ComplianceSlot,
  type EngineSlot,
  type PersonalitySlot,
  type Slot,
  type SlotTree,
} from "../src/index";

// The four worked examples from Section 5, authored one per scope.

const handoffRequired: EngineSlot = {
  key: "handoff.required",
  register: "engine",
  scope: "timeshift",
  kind: "constraint",
  behaviour: "locked",
  steer: false, // detect-only: enforced by validator, no prompt line
  check: { type: "handoff-available" }, // a policy primitive from the closed vocabulary
  interview: null, // platform-authored, not interviewed
  defaultValue: true,
  provenance: { authority: "platform", version: "v1" },
  answerVersionStamp: "v1",
};

const languageOfficial: ComplianceSlot = {
  key: "compliance.language.official",
  register: "compliance",
  scope: "region",
  kind: "constraint",
  behaviour: "locked", // L7 forces this; the type would reject any other value
  steer: true, // steer-needed: the model must be told, and is also validated
  check: { type: "reply-in-official-language" },
  interview: {
    question: "Must this assistant reply in the user's chosen official language?",
    answerShape: { type: "boolean" },
    required: true,
  },
  defaultValue: true,
  provenance: { authority: "business-self-declared", basis: "POPIA-aligned", version: "v1" },
  answerVersionStamp: "v1",
};

const domainDisclaimer: EngineSlot = {
  key: "domain.disclaimer",
  register: "engine",
  scope: "tenant",
  kind: "fill",
  behaviour: "locked", // a locked fill: supplied up, override forbidden down (deny-by-default)
  interview: {
    question: "What disclaimer must appear on every response?",
    answerShape: { type: "shortText", maxLength: 280 },
    required: true,
  },
  defaultValue: "",
  provenance: { authority: "tenant-author", version: "v3" },
  answerVersionStamp: "v3",
};

const personaTone: PersonalitySlot = {
  key: "persona.tone",
  register: "personality",
  scope: "agent",
  kind: "fill", // L9 forces this; the type has no other option for personality
  behaviour: "locked",
  interview: {
    question: "How should this agent sound?",
    answerShape: { type: "enum", options: ["warm", "neutral", "formal"] },
    required: false,
  },
  defaultValue: "neutral",
  provenance: { authority: "agent-owner", version: "v1" },
  answerVersionStamp: "v1",
};

const tree: SlotTree = {
  tenantId: "tenant-acme",
  agentId: "agent-1",
  versions: { timeshift: "v1", region: "v1", tenant: "v3", agent: "v1" },
  slots: {
    timeshift: [handoffRequired],
    region: [languageOfficial],
    tenant: [domainDisclaimer],
    agent: [personaTone],
  },
};

describe("substrate: the slot tree round-trips and the laws hold by construction", () => {
  it("places exactly one well-formed slot at each of the four scopes", () => {
    for (const scope of SCOPE_ORDER) {
      const slots = tree.slots[scope];
      expect(slots).toHaveLength(1);
      expect(slotInvariants(slots[0]!)).toEqual([]);
    }
  });

  it("L7: every compliance slot is locked", () => {
    const all: Slot[] = SCOPE_ORDER.flatMap((s) => [...tree.slots[s]]);
    const compliance = all.filter((s): s is ComplianceSlot => s.register === "compliance");
    expect(compliance.length).toBeGreaterThan(0);
    for (const slot of compliance) {
      expect(slot.behaviour).toBe("locked");
    }
  });

  it("L9: every agent-scope slot is a personality fill", () => {
    for (const slot of tree.slots.agent) {
      expect(slot.register).toBe("personality");
      expect(slot.kind).toBe("fill");
    }
  });
});

describe("substrate: slotInvariants catches the two field-conditional violations", () => {
  it("flags merge on a scalar-valued slot (L8)", () => {
    const bad: EngineSlot = { ...domainDisclaimer, merge: "append" }; // defaultValue is a string
    expect(slotInvariants(bad)).toContain("domain.disclaimer: merge is for list-valued slots only (L8)");
  });

  it("accepts merge on a list-valued slot (L8)", () => {
    const ok: EngineSlot = {
      ...domainDisclaimer,
      key: "domain.allowed-topics",
      kind: "fill",
      merge: "append",
      defaultValue: ["safety", "scope"],
    };
    expect(slotInvariants(ok)).toEqual([]);
  });

  it("flags steer on a non-constraint slot", () => {
    const bad: EngineSlot = { ...domainDisclaimer, steer: true }; // kind is "fill"
    expect(slotInvariants(bad)).toContain("domain.disclaimer: steer is for constraint slots only (Section 5)");
  });
});

describe("substrate: the provenance log is append-only by shape (#5)", () => {
  it("stamps a monotonic, gap-free sequence and scopes by tenant", () => {
    const log = new AppendOnlyLog();
    log.append({ type: "tenant.onboarded", tenantId: "tenant-acme", at: "2026-06-26T10:00:00Z", detail: {} });
    log.append({ type: "slot.authored", tenantId: "tenant-acme", at: "2026-06-26T10:01:00Z", detail: { key: "domain.disclaimer" } });
    log.append({ type: "slot.answered", tenantId: "tenant-beta", at: "2026-06-26T10:02:00Z", detail: { key: "persona.tone" } });

    expect(log.size).toBe(3);
    expect(log.entries().map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(log.entriesForTenant("tenant-acme")).toHaveLength(2);
    expect(log.entriesForTenant("tenant-beta")).toHaveLength(1);
  });

  it("freezes each entry, so a recorded event cannot be rewritten", () => {
    const log = new AppendOnlyLog();
    const event = log.append({ type: "resolution.performed", tenantId: "tenant-acme", at: "2026-06-26T10:00:00Z", detail: {} });
    expect(Object.isFrozen(event)).toBe(true);
    expect(() => {
      // @ts-expect-error - the entry is readonly; this must also fail at runtime
      event.tenantId = "tenant-evil";
    }).toThrow(TypeError);
  });

  it("returns a frozen snapshot that cannot reach back into the log", () => {
    const log = new AppendOnlyLog();
    log.append({ type: "version.bumped", tenantId: "tenant-acme", at: "2026-06-26T10:00:00Z", detail: {} });
    const snapshot = log.entries();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      // @ts-expect-error - the snapshot is readonly; mutating it must throw
      snapshot.push({ seq: 99, type: "version.bumped", tenantId: "x", at: "", detail: {} });
    }).toThrow(TypeError);
    expect(log.size).toBe(1);
  });
});
