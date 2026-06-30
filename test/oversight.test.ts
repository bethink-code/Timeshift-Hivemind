// Phase 4 verification (Goal-Driven Execution), re-baselined to Law 1.
//
// Goals: (1) "explain this agent" answers "why is it like this?" completely — value,
// scope, trail, who, the locks that actually stopped an override, validators watching,
// versions, skills; (2) resolution is never silent — it records its account into the
// append-only log; (3) the oversight readout is total — every event type is present even
// at zero, and it is tenant-scoped.
//
// Under deny-by-default almost every key is locked, so "what is locked" is near-total
// and uninformative. The owner-facing `mandates` is therefore the sharper set: the locks
// that were tested by a lower scope and held. Per-key `locked` still shows every lock.

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
    timeshift: [
      // delegated: the tenant is allowed to set its own greeting (open)
      engine({ key: "greeting", scope: "timeshift", kind: "fill", behaviour: "open", defaultValue: "plain" }),
      // not delegated: the platform disclaimer stands; the tenant's attempt is denied
      engine({ key: "disclaimer", scope: "timeshift", kind: "fill", defaultValue: "Educational only." }),
    ],
    tenant: [
      engine({ key: "greeting", scope: "tenant", kind: "fill", defaultValue: "branded" }),
      engine({ key: "disclaimer", scope: "tenant", kind: "fill", defaultValue: "tenant tries to weaken it" }),
    ],
    region: [compliance({ key: "compliance.language.official", kind: "constraint", steer: true, check: { type: "reply-in-official-language" }, defaultValue: true })],
    agent: [personality({ key: "persona.tone", defaultValue: "warm" })],
    skills: { timeshift: [skill("handoff"), skill("escalation")] },
  });

describe("explain: 'why is this agent like this?' is answered completely", () => {
  it("shows each key's winner, the trail it beat, the locks that held, validators, and skills", () => {
    const tree = sampleTree();
    const explanation = explainAgent(resolve(tree), { skills: inheritSkills(tree.skills), selected: ["handoff"] });

    // a delegated key: the tenant won what the platform opened
    const greeting = explanation.keys.find((k) => k.key === "greeting");
    expect(greeting).toMatchObject({ value: "branded", winningScope: "tenant", authoredBy: "author" });
    expect(greeting?.trail.map((s) => `${s.scope}:${s.outcome}`)).toEqual(["timeshift:overridden", "tenant:won"]);

    // a denied override: the platform disclaimer held against the tenant's attempt
    const disclaimer = explanation.keys.find((k) => k.key === "disclaimer");
    expect(disclaimer).toMatchObject({ value: "Educational only.", winningScope: "timeshift", locked: true });
    expect(disclaimer?.trail.map((s) => `${s.scope}:${s.outcome}`)).toEqual(["timeshift:won", "tenant:blocked-by-lock"]);

    // only the lock that actually stopped a lower-scope override is a "mandate"
    expect([...explanation.mandates]).toEqual(["disclaimer"]);
    expect(explanation.validators).toEqual([
      { key: "compliance.language.official", rule: "output must be in the user's official language", failClosed: true },
    ]);
    expect(explanation.skillsAvailable).toEqual(["escalation", "handoff"]);
    expect(explanation.skillsLoaded).toEqual(["handoff"]);
  });
});

describe("readout: resolution is never silent, and the overview is total", () => {
  it("records a resolution and one event per lock that stopped an override", () => {
    const log = new AppendOnlyLog();
    recordResolution(log, resolve(sampleTree()), "2026-06-26T10:00:00Z");

    const o = overview(log, "tenant-acme");
    expect(o.byType["resolution.performed"]).toBe(1);
    expect(o.byType["mandate.stopped-cascade"]).toBe(1); // only the disclaimer override was denied
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
    expect(all.byType["turn.served"]).toBe(0); // unused here, but present (the serve loop emits it)
    expect(Object.keys(all.byType)).toHaveLength(12);

    expect(overview(log, "t1").totalEvents).toBe(2);
  });
});
