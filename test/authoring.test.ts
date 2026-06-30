// Authoring (slice 4): the wizard face creates a governed agent, with the answer-shape
// boundary enforced before anything is written, and the result servable.

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "../src/index";
import { authoringWizard, authorAgent } from "../server/authoring";
import { demoStore } from "../server/tenants";

const root = mkdtempSync(join(tmpdir(), "timeshift-author-"));
const goodAnswers = { "behaviour.purpose": "Help staff with travel bookings.", "identity.voice": "warm and plain-spoken" };

describe("authoring: the wizard projects the template by scope", () => {
  it("asks for a tenant-scope purpose and an agent-scope voice", () => {
    const qs = authoringWizard();
    expect(qs.map((q) => q.key).sort()).toEqual(["behaviour.purpose", "identity.voice"]);
    const voice = qs.find((q) => q.key === "identity.voice");
    expect(voice?.audience).toBe("agent");
    expect(voice?.answerShape.type).toBe("enum");
  });
});

describe("authoring: the answer-shape boundary is enforced before anything is written", () => {
  it("rejects an out-of-enum voice and an over-long purpose, writing nothing", () => {
    const r = authorAgent({ tenantId: "test-co", agentId: "bad-1", label: "x", answers: { "behaviour.purpose": "x".repeat(201), "identity.voice": "sarcastic" } }, root);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const keys = r.errors.map((e) => e.key);
      expect(keys).toContain("behaviour.purpose");
      expect(keys).toContain("identity.voice");
    }
    expect(demoStore.loadTree("test-co", "bad-1")).toBeUndefined();
  });

  it("rejects a non-path-safe tenant id and a missing required answer", () => {
    const r = authorAgent({ tenantId: "Test Co", agentId: "ok-agent", label: "x", answers: { "identity.voice": "calm and reassuring" } }, root);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const keys = r.errors.map((e) => e.key);
      expect(keys).toContain("tenantId"); // "Test Co" is not kebab-case
      expect(keys).toContain("behaviour.purpose"); // required, not supplied
    }
  });
});

describe("authoring: a valid author creates a servable agent", () => {
  it("registers an agent that lists, resolves, and carries the authored answer", () => {
    const r = authorAgent({ tenantId: "test-co", agentId: "travel-helper", label: "Test Co · Travel helper", answers: goodAnswers }, root);
    expect(r.ok).toBe(true);

    const tree = demoStore.loadTree("test-co", "travel-helper");
    expect(tree?.tenantId).toBe("test-co");
    expect(() => resolve(tree!)).not.toThrow();
    expect(demoStore.tenants().some((t) => t.tenantId === "test-co" && t.agentId === "travel-helper")).toBe(true);

    const purpose = resolve(tree!).keys.find((k) => k.key === "behaviour.purpose");
    expect(purpose?.value).toBe("Help staff with travel bookings."); // the answer became the value
  });

  it("refuses to overwrite an agent that already exists", () => {
    const r = authorAgent({ tenantId: "test-co", agentId: "travel-helper", label: "dup", answers: goodAnswers }, root);
    expect(r.ok).toBe(false);
  });
});
