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
import type { Principal } from "../src/index";

const hive: ExistingSkill[] = [
  { name: "code-review", scope: "timeshift", content: "---\nname: code-review\n---\nReview deeply." },
  { name: "molo-ui", scope: "tenant", project: "molo", content: "---\nname: molo-ui\n---\nTeal brand." },
];

// Verified principals from the edge. Tenant scoping is enforced on these, not on a string.
const owner: Principal = { id: "po-1", tenant: "platform", role: "platform-owner" };
const acmeAdmin: Principal = { id: "ad-acme", tenant: "acme", role: "tenant-admin" };
const acmeStaff: Principal = { id: "st-acme", tenant: "acme", role: "staff" };
const lekanaAdmin: Principal = { id: "ad-lekana", tenant: "Lekana", role: "tenant-admin" };

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

  it("treats the same name held ABOVE as an inherit-conflict, not a legit override (Law 1)", () => {
    // code-review lives at timeshift (Engine). A tenant cannot copy it down and edit it:
    // that is an upward duplicate. The new governance inverts the old most-specific-wins.
    const p = proposeOne({ name: "code-review", scope: "tenant", project: "Lekana", content: "totally different" }, hive);
    expect(p.status).toBe("inherit");
    expect(p.integrity.admissible).toBe(false);
    expect(p.integrity.inheritsFrom).toBe("timeshift");
  });
});

describe("tree-integrity gate: the guard is the last line, after the human tick", () => {
  it("refuses a ticked upward-duplicate even from the right role", () => {
    const incoming: IncomingSkill[] = [{ name: "code-review", scope: "tenant", project: "Lekana", content: "copy-and-edit" }];
    const proposals = propose(incoming, hive);
    const result = applyDecisions(incoming, proposals, [
      { name: "code-review", scope: "tenant", project: "Lekana", accept: true, by: lekanaAdmin },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped.map((p) => p.name)).toContain("code-review");
    expect(result.audit.find((a) => a.name === "code-review")?.reason).toMatch(/already lives/);
  });

  it("blocks a path-unsafe name from ever being admitted", () => {
    const incoming: IncomingSkill[] = [{ name: "../escape", scope: "timeshift", content: "x" }];
    const proposals = propose(incoming, hive);
    expect(proposals[0]!.integrity.admissible).toBe(false);
    const result = applyDecisions(incoming, proposals, [
      { name: "../escape", scope: "timeshift", accept: true, by: owner },
    ]);
    expect(result.applied).toHaveLength(0);
  });
});

describe("confirmer authority is required, and escalates for staff", () => {
  it("maps scope to the role that must confirm", () => {
    expect(requiredConfirmer("timeshift")).toBe("platform-owner");
    expect(requiredConfirmer("tenant")).toBe("tenant-admin");
    expect(requiredConfirmer("agent")).toBe("tenant-admin"); // staff cannot self-approve behaviour
  });
});

describe("applyDecisions: only confirmed items by the right principal take effect", () => {
  const incoming: IncomingSkill[] = [
    { name: "pdf", scope: "timeshift", content: "PDF body" },
    { name: "onboard", scope: "tenant", project: "acme", content: "Onboard body" },
    { name: "voice", scope: "agent", project: "acme", content: "Staff voice body" },
  ];
  const proposals = propose(incoming, hive);

  it("admits an item confirmed by the correct role, and records who (id + role)", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "pdf", scope: "timeshift", accept: true, by: owner, reason: "standard tool" },
    ]);
    expect(result.applied.map((s) => s.name)).toEqual(["pdf"]);
    expect(result.audit.find((a) => a.name === "pdf")).toMatchObject({ action: "admitted", by: "po-1", role: "platform-owner", reason: "standard tool" });
  });

  it("does NOT admit when staff confirm their own behaviour — it routes up instead (L9)", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "voice", scope: "agent", project: "acme", accept: true, by: acmeStaff },
    ]);
    expect(result.applied.map((s) => s.name)).not.toContain("voice");
    expect(result.skipped.map((p) => p.name)).toContain("voice");
  });

  it("admits the same agent-scope skill once the admin of that tenant confirms", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "voice", scope: "agent", project: "acme", accept: true, by: acmeAdmin },
    ]);
    expect(result.applied.map((s) => s.name)).toEqual(["voice"]);
  });

  it("refuses an admin of ANOTHER tenant, even with the right role (tenant isolation)", () => {
    const result = applyDecisions(incoming, proposals, [
      { name: "onboard", scope: "tenant", project: "acme", accept: true, by: lekanaAdmin },
    ]);
    expect(result.applied).toHaveLength(0);
    expect(result.audit.find((a) => a.name === "onboard")?.reason).toMatch(/cannot act on tenant "acme"/);
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
