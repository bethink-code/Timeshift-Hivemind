// Skills: the stable shared behaviour bodies that slots cut holes into (Section 6),
// now first-class governed objects (ARCHITECTURE.md).
//
// Resolution is TOP-DOWN and DENY-BY-DEFAULT: the highest scope that holds a skill name
// wins and, unless it explicitly delegates (behaviour "open"), locks every lower scope
// out. The top rules; nothing below can quietly override it. A skill marked "open" may
// be overridden by a narrower scope. Every win, override, and block is recorded in a
// trail, so the result is explainable.
//
// A skill carries a tiny trigger surface (name + description), always present, and a
// full body that loads only when a task selects it (lazy, task-scoped). Keep skills
// stable and non-overlapping; push variability into slots.

import type { Register, Scope } from "./slot";
import { SCOPE_ORDER } from "./tree";

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  /** Governance. "locked" (the default) means the top rules: no lower scope may override
   *  this skill. "open" means the holding scope delegates override downward. */
  readonly behaviour?: "locked" | "open";
  /** Authorship class. Optional today; the admit validator will come to require it. */
  readonly register?: Register;
}

export interface SkillSurface {
  readonly name: string;
  readonly description: string;
}

/** Skills attached at each scope. */
export type SkillsByScope = Partial<Record<Scope, readonly Skill[]>>;

export type SkillOutcome = "won" | "overridden" | "blocked-by-lock";

export interface SkillStep {
  readonly scope: Scope;
  readonly outcome: SkillOutcome;
}

export interface ResolvedSkill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly winningScope: Scope;
  /** True when a lock (the default) stopped lower scopes from overriding. */
  readonly locked: boolean;
  readonly trail: readonly SkillStep[];
}

interface Scoped {
  readonly scope: Scope;
  readonly skill: Skill;
}

/**
 * Resolve skills top-down, deny-by-default. For each name, the highest scope that holds
 * it wins; unless it is "open", it locks every lower scope out. An "open" skill may be
 * overridden by a narrower scope (most-specific then wins among the open chain). The
 * trail records what each scope's copy did, so "why this skill?" is always answerable.
 */
export function resolveSkills(skills: SkillsByScope | undefined): readonly ResolvedSkill[] {
  const byName = new Map<string, Scoped[]>();
  for (const scope of SCOPE_ORDER) {
    for (const skill of skills?.[scope] ?? []) {
      const list = byName.get(skill.name) ?? [];
      list.push({ scope, skill });
      byName.set(skill.name, list);
    }
  }

  const resolved = [...byName.entries()].map(([name, entries]) => resolveOne(name, entries));
  resolved.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return Object.freeze(resolved);
}

function resolveOne(name: string, entries: readonly Scoped[]): ResolvedSkill {
  const steps: SkillStep[] = [];
  let winner: Scoped | undefined;
  let winnerIdx = -1;
  let frozen = false;

  for (const entry of entries) {
    if (frozen) {
      steps.push({ scope: entry.scope, outcome: "blocked-by-lock" });
      continue;
    }
    const prev = winnerIdx >= 0 ? steps[winnerIdx] : undefined;
    if (prev) steps[winnerIdx] = { ...prev, outcome: "overridden" };
    steps.push({ scope: entry.scope, outcome: "won" });
    winnerIdx = steps.length - 1;
    winner = entry;
    if ((entry.skill.behaviour ?? "locked") === "locked") frozen = true;
  }

  const w = winner ?? entries[0];
  if (!w) throw new Error(`resolveSkills: no entries for ${name}`);
  return {
    name,
    description: w.skill.description,
    body: w.skill.body,
    winningScope: w.scope,
    locked: frozen,
    trail: Object.freeze(steps),
  };
}

/** The effective skills for an agent, lock-respecting. Thin view over resolveSkills for
 *  callers that only need the surviving bodies (the materialiser, the renderer). */
export function inheritSkills(skills: SkillsByScope | undefined): readonly Skill[] {
  return Object.freeze(
    resolveSkills(skills).map((r) => ({ name: r.name, description: r.description, body: r.body })),
  );
}

export function surfacesOf(skills: readonly Skill[]): readonly SkillSurface[] {
  return Object.freeze(skills.map((s) => ({ name: s.name, description: s.description })));
}
