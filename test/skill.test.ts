// Governed skill resolution (Goal-Driven Execution) — Promise 1 and 3 for skills.
//
// Goals: (1) by default the top rules — a lower scope CANNOT override a higher skill of
// the same name (deny-by-default); (2) override happens only when the higher scope marks
// the skill "open" (deliberate delegation downward); (3) every win, override, and block
// is recorded in a trail so "why this skill?" is answerable.

import { describe, expect, it } from "vitest";
import { resolveSkills, type SkillsByScope } from "../src/index";

const named = (name: string, body: string, behaviour?: "locked" | "open") => ({
  name,
  description: `does ${name}`,
  body,
  ...(behaviour ? { behaviour } : {}),
});

describe("resolveSkills: top rules, deny-by-default", () => {
  it("a lower scope cannot quietly override a higher skill of the same name", () => {
    const skills: SkillsByScope = {
      timeshift: [named("code-review", "TOP")],
      tenant: [named("code-review", "TENANT-TRIES-TO-OVERRIDE")],
    };
    const [cr] = resolveSkills(skills);
    expect(cr?.body).toBe("TOP");
    expect(cr?.winningScope).toBe("timeshift");
    expect(cr?.locked).toBe(true);
    // the lower copy is recorded as blocked, not silently dropped
    expect(cr?.trail).toEqual([
      { scope: "timeshift", outcome: "won" },
      { scope: "tenant", outcome: "blocked-by-lock" },
    ]);
  });

  it("overrides only when the higher scope opens it (deliberate delegation)", () => {
    const skills: SkillsByScope = {
      timeshift: [named("tone", "TOP", "open")],
      agent: [named("tone", "STAFF-TUNED")],
    };
    const [tone] = resolveSkills(skills);
    expect(tone?.body).toBe("STAFF-TUNED");
    expect(tone?.winningScope).toBe("agent");
    expect(tone?.locked).toBe(true); // the agent copy itself is locked (nothing below it)
    expect(tone?.trail).toEqual([
      { scope: "timeshift", outcome: "overridden" },
      { scope: "agent", outcome: "won" },
    ]);
  });

  it("a mid-level lock stops an open delegation from reaching the bottom", () => {
    // root opens it, tenant re-locks it: the agent is blocked, tenant wins.
    const skills: SkillsByScope = {
      timeshift: [named("policy", "ROOT", "open")],
      tenant: [named("policy", "TENANT-LOCKS")],
      agent: [named("policy", "STAFF-BLOCKED")],
    };
    const [policy] = resolveSkills(skills);
    expect(policy?.body).toBe("TENANT-LOCKS");
    expect(policy?.winningScope).toBe("tenant");
    expect(policy?.trail.map((s) => `${s.scope}:${s.outcome}`)).toEqual([
      "timeshift:overridden",
      "tenant:won",
      "agent:blocked-by-lock",
    ]);
  });

  it("passes through non-conflicting skills untouched, in name order", () => {
    const skills: SkillsByScope = {
      timeshift: [named("zeta", "Z"), named("alpha", "A")],
      tenant: [named("mid", "M")],
    };
    expect(resolveSkills(skills).map((r) => r.name)).toEqual(["alpha", "mid", "zeta"]);
  });
});
