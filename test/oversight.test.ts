// Phase 4 verification (Goal-Driven Execution).
//
// Goals: (1) "explain this agent" answers "why is it like this?" completely — value,
// scope, trail, who, mandates, validators watching, versions, skills; (2) resolution
// is never silent — it records its account into the append-only log; (3) the oversight
// readout is total — every event type is present even at zero, and it is tenant-scoped.

import { describe, expect, it } from "vitest";
import {
  AppendOnlyLog,
  explainAgent,
  inheritSkills,
  overview,
  recordResolution,
  resolve,
  type SlotTree,
} from "../src/index";
import { compliance, engine, personality, skill, treeOf } from "./helpers";

const sampleTree = (): SlotTree =>
  treeOf({
    timeshift: [engine({ key: "greeting", scope: "timeshift", kind: "fill", behaviour: "default", defaultValue: "plain" })],
    tenant: [
      engine({ key: "greeting", scope: "tenant", kind: "fill", behaviour: "default", defaultValue: "branded" }),
      engine({ key: "disclaimer", scope: "tenant", kind: "fill", behaviour: "mandate", defaultValue: "Educational only." }),
    ],
    region: [compliance({ key: "compliance.language.official", kind: "constraint", steer: true, check: { type: "reply-in-official-language" }, defaultValue: true })],
    agent: [personality({ key: "persona.tone", behaviour: "default", defaultValue: "warm" })],
    skills: { timeshift: [skill("handoff"), skill("escalation")] },
  });

describe("explain: 'why is this agent like this?' is answered completely", () => {
  it("shows each key's winner, the trail it beat, the mandates, validators, and skills", () => {
    const tree = sampleTree();
    const explanation = explainAgent(resolve(tree), { skills: inheritSkills(tree.skills), selected: ["handoff"] });

    const greeting = explanation.keys.find((k) => k.key === "greeting");
    expect(greeting).toMatchObject({ value: "branded", winningScope: "tenant", authoredBy: "author" });
    expect(greeting?.trail.map((s) => `${s.scope}:${s.outcome}`)).toEqual(["timeshift:overridden", "tenant:won"]);

    expect([...explanation.mandates].sort()).toEqual(["compliance.language.official", "disclaimer"]);
    expect(explanation.validators).toEqual([
      { key: "compliance.language.official", rule: "output must be in the user's official language", locked: true },
    ]);
    expect(explanation.skillsAvailable).toEqual(["escalation", "handoff"]);
    expect(explanation.skillsLoaded).toEqual(["handoff"]);
  });
});

describe("readout: resolution is never silent, and the overview is total", () => {
  it("records a resolution and one event per mandate that stopped a cascade", () => {
    const log = new AppendOnlyLog();
    recordResolution(log, resolve(sampleTree()), "2026-06-26T10:00:00Z");

    const o = overview(log, "tenant-acme");
    expect(o.byType["resolution.performed"]).toBe(1);
    expect(o.byType["mandate.stopped-cascade"]).toBe(2); // disclaimer + compliance.language.official
  });

  it("counts every event type, present at zero when unused, and scopes by tenant", () => {
    const log = new AppendOnlyLog();
    log.append({ type: "tenant.onboarded", tenantId: "t1", at: "2026-06-26T10:00:00Z", detail: {} });
    log.append({ type: "slot.authored", tenantId: "t1", at: "2026-06-26T10:01:00Z", detail: {} });
    log.append({ type: "slot.authored", tenantId: "t2", at: "2026-06-26T10:02:00Z", detail: {} });

    const all = overview(log);
    expect(all.totalEvents).toBe(3);
    expect(all.byType["slot.authored"]).toBe(2);
    expect(all.byType["validator.failed"]).toBe(0); // unused, but present: total, not merely populated
    expect(Object.keys(all.byType)).toHaveLength(7);

    expect(overview(log, "t1").totalEvents).toBe(2);
  });
});
