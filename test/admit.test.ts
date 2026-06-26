// Admit flow verification (Goal-Driven Execution).
//
// Goals: (1) propose classifies an incoming skill as new / identical / diverged against
// the hive, and never changes anything; (2) the right confirmer is required per scope,
// with agent-scope escalating to the admin; (3) applyDecisions acts ONLY on confirmed
// items, and ONLY when the confirmer holds the required authority — an accept from the
// wrong role is skipped; (4) everything is recorded.

import { describe, expect, it } from "vitest";
import {
  applyDecisions,
  propose,
  proposeOne,
  renderProposal,
  requiredConfirmer,
  type ExistingSkill,
  type IncomingSkill,
} from "../tools/admit";

const hive: ExistingSkill[] = [
  { name: "code-review", scope: "timeshift", content: "---\nname: code-review\n---\nReview deeply." },
  { name: "molo-ui", scope: "tenant", project: "molo", content: "---\nname: molo-ui\n---\nTeal brand." },
];

describe("propose: classifies the incoming skill, changing nothing", () => {
  it("calls a brand-new skill new", () => {
    const p = proposeOne({ name: "pdf", scope: "timeshift", content: "..." }, hive);
    expect(p.status).toBe("new");
  });

  it("calls an unchanged re-import identical", () => {
    const p = proposeOne({ name: "code-review", scope: "timeshift", content: "---\nname: code-review\n---\nReview deeply." }, hive);
    expect(p.status).toBe("identical");
  });

  it("calls a changed copy diverged, with the diff measured", () => {
    const p = proposeOne({ name: "code-review", scope: "timeshift", content: "---\nname: code-review\n---\nReview deeply.\nAnd run the linter." }, hive);
    expect(p.status).toBe("diverged");
    expect(p.verdict?.summary).toMatch(/shared/);
  });

  it("treats the same name at a different scope as new, not a conflict (a legit override)", () => {
    const p = proposeOne({ name: "code-review", scope: "tenant", project: "Lekana", content: "totally different" }, hive);
    expect(p.status).toBe("new"); // tenant/Lekana is a different slot from timeshift
  });
});

describe("confirmer authority is required, and escalates for staff", () => {
  it("maps scope to the role that must confirm", () => {
    expect(requiredConfirmer("timeshift")).toBe("platform-owner");
    expect(requiredConfirmer("tenant")).toBe("tenant-admin");
    expect(requiredConfirmer("agent")).toBe("tenant-admin"); // staff cannot self-approve behaviour
  });
});

describe("applyDecisions: only confirmed items by the right human take effect", () => {
  const incoming: IncomingSkill[] = [
    { name: "pdf", scope: "timeshift", content: "PDF body" },
    { name: "onboard", scope: "tenant", project: "ReportPress", content: "Onboard body" },
    { name: "voice", scope: "agent", content: "Staff voice body" },
  ];
  const proposals = propose(incoming, hive);

  it("admits an item confirmed by the correct role, and records it", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "pdf", scope: "timeshift", accept: true, by: "platform-owner", reason: "standard tool" },
    ]);
    expect(result.applied.map((s) => s.name)).toEqual(["pdf"]);
    expect(result.audit.find((a) => a.name === "pdf")).toMatchObject({ action: "admitted", by: "platform-owner", reason: "standard tool" });
  });

  it("does NOT admit when the wrong role confirms — it routes up instead", () => {
    // a staff member trying to wave through their own agent-scope skill: needs tenant-admin
    const result = applyDecisions(incoming, proposals, [
      { name: "voice", scope: "agent", accept: true, by: "staff-member" },
    ]);
    expect(result.applied.map((s) => s.name)).not.toContain("voice");
    expect(result.skipped.map((p) => p.name)).toContain("voice");
  });

  it("admits the same agent-scope skill once the admin confirms", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "voice", scope: "agent", accept: true, by: "tenant-admin" },
    ]);
    expect(result.applied.map((s) => s.name)).toEqual(["voice"]);
  });

  it("applies nothing for un-ticked items", () => {
    const result = applyDecisions(incoming, proposals, []);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(proposals.length);
  });
});

describe("renderProposal: the review surface sorts trivial from real", () => {
  it("splits conflicts from safe items and offers a tick box for each", () => {
    const report = renderProposal(propose([
      { name: "pdf", scope: "timeshift", content: "new" },
      { name: "code-review", scope: "timeshift", content: "---\nname: code-review\n---\nReview deeply.\nplus more" },
    ], hive));
    expect(report).toContain("## Needs your decision");
    expect(report).toContain("**code-review**");
    expect(report).toContain("## Safe to wave through");
    expect(report).toContain("- [ ] **pdf**");
  });
});
