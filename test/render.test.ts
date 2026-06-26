// Phase 3 verification (Goal-Driven Execution).
//
// Goals: (1) the prompt is rendered from fill keys only, grouped by register and
// deterministically positioned; (2) constraints stay out of the prompt except the
// steer-needed ones, which appear as a guardrails block; (3) skills load lazily —
// every trigger surface is available, but only selected bodies reach the prompt.

import { describe, expect, it } from "vitest";
import { inheritSkills, renderPrompt, resolve, type SlotTree } from "../src/index";
import { compliance, engine, personality, skill, treeOf } from "./helpers";

const sampleTree = (): SlotTree =>
  treeOf({
    agent: [personality({ key: "persona.tone", behaviour: "default", defaultValue: "warm" })],
    tenant: [engine({ key: "domain.disclaimer", scope: "tenant", kind: "fill", behaviour: "mandate", defaultValue: "Educational only." })],
    region: [
      compliance({ key: "compliance.notice", kind: "fill", defaultValue: "Regulated by the FSB." }),
      compliance({ key: "compliance.language.official", kind: "constraint", steer: true, check: { type: "reply-in-official-language" }, defaultValue: true }),
    ],
    skills: {
      timeshift: [skill("handoff"), skill("escalation")],
      tenant: [skill("dosage"), skill("species"), skill("contraindication")],
    },
  });

describe("render: the prompt is fills only, grouped by register and deterministic", () => {
  it("places each fill under its register's section and the steer line under Guardrails", () => {
    const rendered = renderPrompt(resolve(sampleTree()));
    const titles = rendered.sections.map((s) => s.title);
    expect(titles).toEqual(["Identity", "Behaviour", "Compliance", "Guardrails"]);

    expect(rendered.text).toContain("# Identity\n- persona.tone: warm");
    expect(rendered.text).toContain("- domain.disclaimer: Educational only.");
    expect(rendered.text).toContain("- compliance.notice: Regulated by the FSB.");
    expect(rendered.text).toContain("# Guardrails\n- Reply in the user's chosen official language.");
  });

  it("keeps constraints out of the fill sections (they are not prose lines)", () => {
    const rendered = renderPrompt(resolve(sampleTree()));
    const fillText = rendered.sections.filter((s) => s.title !== "Guardrails").map((s) => s.lines.join("\n")).join("\n");
    expect(fillText).not.toContain("compliance.language.official");
  });

  it("is deterministic: same inputs, same prompt", () => {
    const a = renderPrompt(resolve(sampleTree()));
    const b = renderPrompt(resolve(sampleTree()));
    expect(a).toEqual(b);
  });
});

describe("render: skills load lazily (Section 6 economics)", () => {
  it("makes every trigger surface available but renders only selected bodies", () => {
    const tree = sampleTree();
    const inherited = inheritSkills(tree.skills);
    const rendered = renderPrompt(resolve(tree), { skills: inherited, selected: ["dosage"] });

    // all five surfaces are available (eager), and tiny
    expect(rendered.availableSkills).toHaveLength(5);
    expect(rendered.availableSkills.map((s) => s.name).sort()).toEqual(["contraindication", "dosage", "escalation", "handoff", "species"]);

    // only the one selected body is loaded (lazy)
    expect(rendered.loadedSkills).toEqual(["dosage"]);
    expect(rendered.text).toContain("BODY:dosage");
    expect(rendered.text).not.toContain("BODY:species");
    expect(rendered.text).not.toContain("BODY:handoff");
  });

  it("renders no Skills section when the task selects nothing", () => {
    const tree = sampleTree();
    const rendered = renderPrompt(resolve(tree), { skills: inheritSkills(tree.skills), selected: [] });
    expect(rendered.sections.map((s) => s.title)).not.toContain("Skills");
    expect(rendered.loadedSkills).toEqual([]);
  });
});
