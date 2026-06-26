// Skills: the stable shared behaviour bodies that slots cut holes into (Section 6).
//
// A skill carries a tiny trigger surface (name + description) that is always present,
// and a full body that is loaded only when a task selects it. This is the lazy,
// task-scoped loading that lets hundreds of agents share a deep library without any
// one prompt paying for all of it: the cascade decides what is available, the task
// decides what is present. Keep skills stable and non-overlapping; push variability
// into slots, not into competing prose.

import type { Scope } from "./slot";
import { SCOPE_ORDER } from "./tree";

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

/** The eager part: tiny, always assembled, used by the task router. */
export interface SkillSurface {
  readonly name: string;
  readonly description: string;
}

/** Skills attached at each scope. Optional on the tree; absent means none. */
export type SkillsByScope = Partial<Record<Scope, readonly Skill[]>>;

/** Inherit skills down the tree, most-specific name wins: the same L2 idea applied to
 *  skill names, so a tenant may override a platform skill of the same name. Returns one
 *  skill per name, in stable name order (L6). */
export function inheritSkills(skills: SkillsByScope | undefined): readonly Skill[] {
  const byName = new Map<string, Skill>();
  for (const scope of SCOPE_ORDER) {
    for (const skill of skills?.[scope] ?? []) {
      byName.set(skill.name, skill); // a narrower scope overwrites a broader one
    }
  }
  const sorted = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return Object.freeze(sorted);
}

export function surfacesOf(skills: readonly Skill[]): readonly SkillSurface[] {
  return Object.freeze(skills.map((s) => ({ name: s.name, description: s.description })));
}
