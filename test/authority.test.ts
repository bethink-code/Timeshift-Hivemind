// Authority verification (Goal-Driven Execution).
//
// Goals: (1) the right role is required per scope, and authority falls down the layers;
// (2) a tenant-scoped change is bound to ONE tenant — a tenant admin of another tenant is
// refused even with the right role (the isolation a self-declared string never had);
// (3) staff can never self-approve (L9); (4) the platform owner acts above tenants.

import { describe, expect, it } from "vitest";
import { canConfirm, requirementFor, type Principal } from "../src/index";

const platformOwner: Principal = { id: "po-1", tenant: "platform", role: "platform-owner" };
const acmeAdmin: Principal = { id: "ad-1", tenant: "acme", role: "tenant-admin" };
const betaAdmin: Principal = { id: "ad-2", tenant: "beta", role: "tenant-admin" };
const acmeStaff: Principal = { id: "st-1", tenant: "acme", role: "staff" };

describe("requirementFor: authority falls as you go down the layers", () => {
  it("needs the platform owner at Engine and Region, tenant-unbound", () => {
    expect(requirementFor("timeshift")).toEqual({ role: "platform-owner", tenantScoped: false });
    expect(requirementFor("region")).toEqual({ role: "platform-owner", tenantScoped: false });
  });

  it("needs the tenant admin at Tenant and User, bound to the tenant", () => {
    expect(requirementFor("tenant")).toEqual({ role: "tenant-admin", tenantScoped: true });
    expect(requirementFor("agent")).toEqual({ role: "tenant-admin", tenantScoped: true });
  });
});

describe("canConfirm: role and tenant are both enforced", () => {
  it("lets the platform owner confirm an Engine change, above any tenant", () => {
    expect(canConfirm(platformOwner, "timeshift").ok).toBe(true);
  });

  it("refuses a tenant admin at the Engine layer (role too low)", () => {
    const d = canConfirm(acmeAdmin, "timeshift");
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/needs platform-owner/);
  });

  it("lets a tenant admin confirm a change in their OWN tenant", () => {
    expect(canConfirm(acmeAdmin, "tenant", "acme").ok).toBe(true);
    expect(canConfirm(acmeAdmin, "agent", "acme").ok).toBe(true);
  });

  it("refuses a tenant admin reaching into ANOTHER tenant (isolation)", () => {
    const d = canConfirm(betaAdmin, "tenant", "acme");
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/tenant "beta" cannot act on tenant "acme"/);
  });

  it("refuses a staff member confirming their own behaviour — it escalates (L9)", () => {
    const d = canConfirm(acmeStaff, "agent", "acme");
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/needs tenant-admin, not staff/);
  });

  it("refuses a tenant-scoped change that names no tenant", () => {
    const d = canConfirm(acmeAdmin, "tenant");
    expect(d.ok).toBe(false);
    expect(d.reason).toMatch(/names no tenant/);
  });
});
