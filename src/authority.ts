// Authority: who may confirm a change, and over whose data (P2, VISION.md — "nothing
// changes without the right person's yes").
//
// The engine does not authenticate. Identity is established at the edge (OAuth, a session,
// an API key — an adapter concern, right of the seam). What crosses into the core is a
// Principal: an already-verified identity carrying its id, its tenant, and its role. This
// module's one job is to ENFORCE role and tenant scoping on that Principal — the checks a
// self-declared "by" string could never make:
//   - role: the change at this scope needs a specific role to sign it (authority falls as
//     you go down the layers — Engine needs the platform owner; Tenant and User need the
//     tenant admin; staff can never self-approve their own behaviour, L9).
//   - tenant: a tenant-scoped change may be signed only by a principal of THAT tenant. A
//     tenant admin of one tenant cannot reach into another's tree. This is the tenant
//     isolation the old string had no way to express.

import type { Scope } from "./slot";

/** The closed set of roles. `staff` is a real principal (a User-layer member) but is never
 *  a required confirmer: a staff change escalates to the tenant admin (L9). */
export type Role = "platform-owner" | "tenant-admin" | "staff";

/** An already-verified identity from the edge. The core trusts that authentication
 *  happened (it cannot do it here) and enforces authorisation on what it was handed. */
export interface Principal {
  readonly id: string;
  readonly tenant: string;
  readonly role: Role;
}

/** What confirming a change at a scope requires: the signing role, and whether the
 *  principal must belong to the resource's own tenant. */
export interface AuthorityRequirement {
  readonly role: Role;
  readonly tenantScoped: boolean;
}

/** The requirement at each scope. Engine (timeshift) and Region sit above any one tenant,
 *  so the platform owner signs and there is no tenant to match. Tenant and User changes
 *  are the tenant admin's, bound to that tenant. */
export function requirementFor(scope: Scope): AuthorityRequirement {
  switch (scope) {
    case "timeshift":
    case "region":
      return { role: "platform-owner", tenantScoped: false };
    case "tenant":
    case "agent":
      return { role: "tenant-admin", tenantScoped: true };
  }
}

export interface AuthorityDecision {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * May this principal confirm a change at `scope` for `resourceTenant`?
 *
 * Pure and total. Refuses, with a reason, when the role is wrong, when a tenant-scoped
 * change names no tenant, or when the principal belongs to a different tenant than the
 * resource. Identity is presumed verified upstream; this is the authorisation gate only.
 */
export function canConfirm(principal: Principal, scope: Scope, resourceTenant?: string): AuthorityDecision {
  const req = requirementFor(scope);

  if (principal.role !== req.role) {
    return { ok: false, reason: `confirming a ${scope} change needs ${req.role}, not ${principal.role}` };
  }

  if (req.tenantScoped) {
    if (resourceTenant === undefined) {
      return { ok: false, reason: `a ${scope} change is tenant-scoped but names no tenant` };
    }
    if (principal.tenant !== resourceTenant) {
      return { ok: false, reason: `${principal.role} of tenant "${principal.tenant}" cannot act on tenant "${resourceTenant}"` };
    }
  }

  return { ok: true };
}
