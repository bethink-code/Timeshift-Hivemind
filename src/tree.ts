// The slot tree: the authored input the resolver walks.
//
// The tree handed to the resolver is already scoped to one tenant. The resolver is a
// pure function over this structure and never fetches anything itself, which is what
// makes it structurally incapable of crossing tenants (#1, Section 7): there is no
// code path by which it could read another tenant's slots, because it is never given
// them.

import type { Scope, Slot } from "./slot";
import type { SkillsByScope } from "./skill";

export interface SlotTree {
  readonly tenantId: string;
  /** The one agent this assembled stack resolves to. A tree is the full inherited
   *  set for a single agent (root + region + tenant + that agent), pre-assembled by
   *  the caller, which is why the resolver never fetches and so cannot cross tenants. */
  readonly agentId: string;
  /** The version of each scope, stamped into every resolution for determinism (L6)
   *  and version-driven cache invalidation (Section 7). */
  readonly versions: Readonly<Record<Scope, string>>;
  /** The slots living at each scope, broadest (timeshift) to narrowest (agent). */
  readonly slots: Readonly<Record<Scope, readonly Slot[]>>;
  /** The stable behaviour bodies inherited through the tree (Section 6). Optional;
   *  absent means the agent inherits no skills, only resolved slots. */
  readonly skills?: SkillsByScope;
}

/** Scopes in cascade order, broadest to narrowest (Section 2). The single source of
 *  truth for ordering; the resolver and any tooling read it from here. */
export const SCOPE_ORDER: readonly Scope[] = ["timeshift", "region", "tenant", "agent"];
