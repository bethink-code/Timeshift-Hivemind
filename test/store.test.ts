// The tree store (slice 2 backbone): tenant-scoped loading + isolation.
//
// The seam that feeds the resolver must be tenant-isolated by construction — an agent is
// reachable only under its own tenant's id, never another's — and every tree it hands over
// must be a well-formed governed tree (resolve() refuses a malformed one). These pin both.

import { describe, it, expect } from "vitest";
import { resolve } from "../src/index";
import { demoStore } from "../server/tenants";

describe("InMemoryTreeStore: tenant-scoped tree loading", () => {
  it("lists every demo agent across tenants", () => {
    const refs = demoStore.tenants().map((r) => `${r.tenantId}/${r.agentId}`).sort();
    expect(refs).toEqual([
      "acme-health/claims-assistant",
      "demo-tenant/benefits-counsellor",
      "demo-tenant/leave-advisor",
    ]);
  });

  it("loads a tenant-scoped tree that resolves cleanly", () => {
    const tree = demoStore.loadTree("demo-tenant", "benefits-counsellor");
    expect(tree?.tenantId).toBe("demo-tenant");
    expect(() => resolve(tree!)).not.toThrow();
  });

  it("isolates tenants: an agent is unreachable under another tenant's id", () => {
    expect(demoStore.loadTree("acme-health", "benefits-counsellor")).toBeUndefined(); // wrong tenant
    expect(demoStore.loadTree("demo-tenant", "claims-assistant")).toBeUndefined(); // wrong tenant
    expect(demoStore.loadTree("nope", "nope")).toBeUndefined();
  });

  it("inherits the platform rule and carries the tenant's own rule into the resolved tree", () => {
    const keys = resolve(demoStore.loadTree("acme-health", "claims-assistant")!).keys.map((k) => k.key);
    expect(keys).toContain("safety.no-guarantees"); // platform rule, inherited from timeshift
    expect(keys).toContain("style.forbidden-phrases"); // acme's own no-diagnosis rule

    // the agent without a tenant rule inherits the platform rule but adds no tenant guardrail
    const plain = resolve(demoStore.loadTree("demo-tenant", "leave-advisor")!).keys.map((k) => k.key);
    expect(plain).toContain("safety.no-guarantees");
    expect(plain).not.toContain("style.forbidden-phrases");
  });
});
