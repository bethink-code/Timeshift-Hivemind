// The thesis (Section 10, Section 14): one slot model, one resolved object, six faces.
//
// This is the capstone. A single realistic agent is authored once, resolved once, and
// then every face is shown to be a projection of that one object: the resolver, the
// prompt, the validators, the attestation, the wizards, and the oversight surface.
// Nothing below builds a second data model; that is the whole point.
//
// The tree exercises Law 1 (ARCHITECTURE.md) directly: the platform DELEGATES the
// greeting downward (open), so the tenant authors it and wins; the platform LOCKS its
// safety disclaimer (deny-by-default), so the tenant's attempt to weaken it is denied.
// Both are visible as projections of the same resolved object.

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

// One whole agent: a benefits/veterinary counselling assistant, plus a small skill set.
const tree: SlotTree = treeOf({
  timeshift: [
    engine({ key: "handoff.required", scope: "timeshift", kind: "constraint", check: { type: "handoff-available" }, defaultValue: true }),
    // the platform's non-negotiable; deny-by-default, so the tenant cannot weaken it
    engine({ key: "safety.disclaimer", scope: "timeshift", kind: "fill", defaultValue: "Educational only, not veterinary advice." }),
    // delegated downward: the tenant may author its own greeting
    engine({ key: "greeting.style", scope: "timeshift", kind: "fill", behaviour: "open", defaultValue: "Hi." }),
  ],
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
    // the tenant takes up the delegated greeting
    engine({
      key: "greeting.style",
      scope: "tenant",
      kind: "fill",
      defaultValue: "Welcome to AcmeVet!",
      interview: { question: "How should this assistant greet?", answerShape: { type: "shortText", maxLength: 80 }, required: false },
    }),
    // and tries (in vain) to soften the locked platform disclaimer
    engine({ key: "safety.disclaimer", scope: "tenant", kind: "fill", defaultValue: "Trust us, basically vet advice." }),
  ],
  agent: [
    personality({
      key: "persona.tone",
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

  it("face 1, the resolver: top-down deny-by-default, with delegation where opened", () => {
    expect(resolved.keys.map((k) => k.key)).toEqual([
      "compliance.language.official",
      "greeting.style",
      "handoff.required",
      "persona.tone",
      "safety.disclaimer",
    ]);
    // deny-by-default: every effective key is locked against a lower override
    expect(resolved.keys.every((k) => k.locked)).toBe(true);
    // the delegated greeting was authored by the tenant; the locked disclaimer held
    expect(resolved.keys.find((k) => k.key === "greeting.style")).toMatchObject({ value: "Welcome to AcmeVet!", winningScope: "tenant" });
    expect(resolved.keys.find((k) => k.key === "safety.disclaimer")).toMatchObject({ value: "Educational only, not veterinary advice.", winningScope: "timeshift" });
  });

  it("face 2, the prompt: fills positioned, the steer line in, only the selected skill body", () => {
    const prompt = renderPrompt(resolved, { skills: inherited, selected: ["dosage"] });
    expect(prompt.text).toContain("- persona.tone: warm");
    expect(prompt.text).toContain("- safety.disclaimer: Educational only, not veterinary advice.");
    expect(prompt.text).toContain("- greeting.style: Welcome to AcmeVet!");
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

  it("face 4, the attestation: explains why, with the locks that held and the watchers", () => {
    const explanation = explainAgent(resolved, { skills: inherited, selected: ["dosage"] });
    expect(explanation.mandates).toContain("safety.disclaimer"); // the override that was denied
    expect(explanation.mandates).not.toContain("greeting.style"); // delegated, not stopped
    expect(explanation.validators.map((v) => v.key)).toContain("compliance.language.official");
    expect(explanation.skillsLoaded).toEqual(["dosage"]);
  });

  it("face 5, the wizards: each scope's filler sees only their register", () => {
    expect(buildWizard(tree, "agent").map((q) => q.key)).toEqual(["persona.tone"]);
    expect(buildWizard(tree, "tenant-setup").map((q) => q.key)).toEqual(["greeting.style"]);
    expect(buildWizard(tree, "compliance").map((q) => q.key)).toEqual(["compliance.language.official"]);
  });

  it("face 6, the oversight surface: the resolution recorded, nothing silent", () => {
    const log = new AppendOnlyLog();
    recordResolution(log, resolved, "2026-06-26T10:00:00Z");
    const o = overview(log, tree.tenantId);
    expect(o.byType["resolution.performed"]).toBe(1);
    expect(o.byType["mandate.stopped-cascade"]).toBe(1); // only the disclaimer override was denied
  });
});
