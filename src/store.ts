// The tree store: the seam between storage and the resolver (the slice-2 backbone).
//
// The resolver consumes a SlotTree already scoped to ONE tenant+agent (tree.ts) — it never
// fetches, which is exactly what makes it structurally unable to cross tenants. Something
// upstream has to do that fetch-and-assemble, tenant-scoped: that is a TreeStore. The
// interface is a pure contract; the implementations are the edge — an in-memory store of
// fixtures now, a Drizzle/Neon-backed store later, behind this same shape (P1: swap the
// backend, never the engine).

import type { SlotTree } from "./tree";

/** One addressable agent, for a picker. (tenantId, agentId) is the key a store loads by. */
export interface TenantRef {
  readonly tenantId: string;
  readonly agentId: string;
  /** Human-facing label, e.g. "Acme Health · Claims assistant". */
  readonly label: string;
}

/** Fetch-and-assemble a tenant-scoped SlotTree. Tenant isolation lives here: loadTree only
 *  ever returns the tree for the (tenant, agent) asked for, and undefined for anything else
 *  — so the seam cannot hand the resolver another tenant's slots. */
export interface TreeStore {
  /** Every agent this store can serve. */
  tenants(): readonly TenantRef[];
  /** The resolved-ready tree for one agent; undefined if this store holds no such agent. */
  loadTree(tenantId: string, agentId: string): SlotTree | undefined;
}
