// The thesis (Section 10, Section 14): one slot model, one resolved object, six faces.
//
// This is the capstone. A single realistic agent is authored once, resolved once, and
// then every face is shown to be a projection of that one object: the resolver, the
// prompt, the validators, the attestation, the wizards, and the oversight surface.
// Nothing below builds a second data model; that is the whole point.

import { describe, expect, it } from "vitest";
import {
  AppendOnlyLog,
  buildWizard,
  compileValidators,
  explainAgent,
  inheritSkills,
  overview,
  recordResolution,
  renderPrompt,
  resolve,
  runValidators,
  type SlotTree,
} from "../src/index";
import { compliance, engine, personality, skill, treeOf } from "./helpers";

// The four worked examples of Section 5, plus a small skill library: one whole agent.
const tree: SlotTree = treeOf({
  timeshift: [engine({ key: "handoff.required", scope: "timeshift", kind: "constraint", behaviour: "mandate", check: { type: "handoff-available" }, defaultValue: true })],
  region: [
    compliance({
      key: "compliance.language.official",
      kind: "constraint",
      steer: true,
      check: { type: "reply-in-official-language" },
      defaultValue: true,
      interview: { question: "Reply in the user's official language?", answerShape: { type: "boolean" }, required: true },
    }),
  ],
  tenant: [
    engine({
      key: "domain.disclaimer",
      scope: "tenant",
      kind: "fill",
      behaviour: "mandate",
      defaultValue: "Educational only, not veterinary advice.",
      interview: { question: "What disclaimer must appear on every response?", answerShape: { type: "shortText", maxLength: 280 }, required: true },
    }),
  ],
  agent: [
    personality({
      key: "persona.tone",
      behaviour: "default",
      defaultValue: "warm",
      interview: { question: "How should this agent sound?", answerShape: { type: "enum", options: ["warm", "neutral", "formal"] }, required: false },
    }),
  ],
  skills: { timeshift: [skill("handoff"), skill("escalation")], tenant: [skill("dosage"), skill("species")] },
});

describe("the slot model projects into six faces from one resolved object", () => {
  // Authored once, resolved once. Every face below reads this, or the tree it came from.
  const resolved = resolve(tree);
  const inherited = inheritSkills(tree.skills);

  it("face 1, the resolver: composes the agent's effective set, mandates locked", () => {
    expect(resolved.keys.map((k) => k.key).sort()).toEqual([
      "compliance.language.official",
      "domain.disclaimer",
      "handoff.required",
      "persona.tone",
    ]);
    expect(resolved.keys.filter((k) => k.locked).map((k) => k.key).sort()).toEqual([
      "compliance.language.official",
      "domain.disclaimer",
      "handoff.required",
    ]);
  });

  it("face 2, the prompt: fills positioned, the steer line in, only the selected skill body", () => {
    const prompt = renderPrompt(resolved, { skills: inherited, selected: ["dosage"] });
    expect(prompt.text).toContain("- persona.tone: warm");
    expect(prompt.text).toContain("- domain.disclaimer: Educational only, not veterinary advice.");
    expect(prompt.text).toContain("- Reply in the user's chosen official language.");
    expect(prompt.text).toContain("BODY:dosage");
    expect(prompt.text).not.toContain("BODY:species");
    expect(prompt.availableSkills).toHaveLength(4); // all surfaces eager, one body loaded
  });

  it("face 3, the validators: compiled from constraints, failing closed to handoff", () => {
    const validators = compileValidators(resolved);
    expect(validators.map((v) => v.key).sort()).toEqual(["compliance.language.official", "handoff.required"]);
    const verdict = runValidators(validators, "wrong language reply", { officialLanguage: "en", outputLanguage: "fr", handoffAvailable: true });
    expect(verdict.status).toBe("handoff");
  });

  it("face 4, the attestation: explains why, with mandates and watchers", () => {
    const explanation = explainAgent(resolved, { skills: inherited, selected: ["dosage"] });
    expect(explanation.mandates).toContain("domain.disclaimer");
    expect(explanation.validators.map((v) => v.key)).toContain("compliance.language.official");
    expect(explanation.skillsLoaded).toEqual(["dosage"]);
  });

  it("face 5, the wizards: each scope's filler sees only their register", () => {
    expect(buildWizard(tree, "agent").map((q) => q.key)).toEqual(["persona.tone"]);
    expect(buildWizard(tree, "tenant-setup").map((q) => q.key)).toEqual(["domain.disclaimer"]);
    expect(buildWizard(tree, "compliance").map((q) => q.key)).toEqual(["compliance.language.official"]);
  });

  it("face 6, the oversight surface: the resolution recorded, nothing silent", () => {
    const log = new AppendOnlyLog();
    recordResolution(log, resolved, "2026-06-26T10:00:00Z");
    const o = overview(log, tree.tenantId);
    expect(o.byType["resolution.performed"]).toBe(1);
    expect(o.byType["mandate.stopped-cascade"]).toBe(3); // the three locked keys
  });
});
