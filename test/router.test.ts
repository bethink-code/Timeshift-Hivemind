// Router verification (Goal-Driven Execution), ARCHITECTURE.md §router.
//
// Goals: (1) the right few skills are selected for a task from their trigger surfaces
// alone (name weighs more than description), and irrelevant ones are left out; (2) it is
// lazy — it routes from surfaces (name + description), never bodies, and the chosen names
// feed renderPrompt so only those bodies load; (3) pinned skills are always kept and the
// limit bounds the rest; (4) it is deterministic and carries the "why" (matched terms).

import { describe, expect, it } from "vitest";
import {
  inheritSkills,
  renderPrompt,
  resolve,
  route,
  routedNames,
  surfacesOf,
  type SkillSurface,
} from "../src/index";
import { skill, treeOf } from "./helpers";

const surfaces: readonly SkillSurface[] = [
  { name: "dosage", description: "calculate the medication dose and amount" },
  { name: "species", description: "horse and pet species differences" },
  { name: "code-review", description: "review code quality and security" },
  { name: "escalation", description: "hand off to a human" },
];

describe("route: selects the task-relevant few from trigger surfaces", () => {
  it("matches on name and description, and leaves the irrelevant out", () => {
    const result = route(surfaces, { query: "how do I review the code for security" });
    expect(result.selected.map((s) => s.name)).toEqual(["code-review"]);
    expect(result.selected[0]).toMatchObject({ reason: "matched" });
    expect(result.selected[0]!.matched).toEqual(expect.arrayContaining(["review", "code", "security"]));
    expect(result.considered).toBe(4);
  });

  it("ranks a name hit above a description-only hit", () => {
    // "dosage" hits the dosage NAME (weight 2); "horse" hits the species DESCRIPTION (1)
    const result = route(surfaces, { query: "horse dosage" });
    expect(result.selected.map((s) => s.name)).toEqual(["dosage", "species"]);
    expect(result.selected[0]!.score).toBeGreaterThan(result.selected[1]!.score);
  });

  it("selects nothing when no surface is triggered", () => {
    expect(route(surfaces, { query: "completely unrelated zzz" }).selected).toHaveLength(0);
  });
});

describe("route: pinned always-on and the limit", () => {
  it("keeps a pinned skill even with no query match, recorded as pinned", () => {
    const result = route(surfaces, { query: "nothing relevant here", pinned: ["escalation"] });
    expect(result.selected.map((s) => s.name)).toEqual(["escalation"]);
    expect(result.selected[0]).toMatchObject({ reason: "pinned" });
  });

  it("caps the matched skills but never drops a pinned one", () => {
    const result = route(surfaces, { query: "review code dose horse", pinned: ["escalation"], limit: 2 });
    // pinned first (by name), then the single highest-scoring match fills the remaining room
    expect(result.selected.map((s) => s.name)).toEqual(["escalation", "code-review"]);
  });
});

describe("route: deterministic and explainable", () => {
  it("returns the same selection and order for the same input", () => {
    const a = route(surfaces, { query: "horse dosage" });
    const b = route(surfaces, { query: "horse dosage" });
    expect(a).toEqual(b);
  });
});

describe("router is lazy: it feeds renderPrompt's selected so only chosen bodies load", () => {
  it("routes from surfaces, then renders only the routed skill's body", () => {
    const tree = treeOf({
      skills: { timeshift: [skill("dosage"), skill("species")], tenant: [skill("code-review")] },
    });
    const inherited = inheritSkills(tree.skills);

    const result = route(surfacesOf(inherited), { query: "please review the code" });
    expect(routedNames(result)).toEqual(["code-review"]);

    const prompt = renderPrompt(resolve(tree), { skills: inherited, selected: routedNames(result) });
    expect(prompt.text).toContain("BODY:code-review");
    expect(prompt.text).not.toContain("BODY:dosage");
    expect(prompt.availableSkills).toHaveLength(3); // all surfaces eager; one body loaded
  });
});
