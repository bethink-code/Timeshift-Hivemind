// The "why" surface for the interface (P3 — "see exactly why your AI does what it does").
//
// Three real-data answers, all projections of the engine, no second data model:
//   - resolution: why THESE skills? resolveSkills' trail — what each scope's copy did
//     (won / overridden / blocked by a lock), so the top-down governance is visible.
//   - routing: why each one is LOADED for a task? the router's matched terms and score.
//   - audit: what changed and who signed it? the one append-only event log.
// Slot-level explain (resolved keys) waits for a loaded tenant tree; the hive holds skills,
// so that is what the screen answers honestly today.

import { join } from "node:path";
import {
  inheritSkills,
  resolveSkills,
  route,
  surfacesOf,
  type RouteResult,
  type SkillsByScope,
} from "../src/index";
import { readHive, readProjects, type HiveSkill } from "../tools/materialize";
import { FileAuditLog } from "../tools/audit-log";

function hiveDirOf(root: string): string {
  return join(root, "hive");
}

/** The project keys the screen can explain: every tenant project the hive holds skills for,
 *  plus any named in the project map. */
export function whyProjects(root: string): string[] {
  const dir = hiveDirOf(root);
  const projects = new Set<string>();
  for (const s of readHive(dir)) if (s.scope === "tenant" && s.project) projects.add(s.project);
  for (const m of readProjects(dir)) projects.add(m.project);
  return [...projects].sort();
}

/** The cascade for one project: the global (timeshift) skills plus that project's own. */
function byScope(hive: readonly HiveSkill[], project: string): SkillsByScope {
  return {
    timeshift: hive.filter((s) => s.scope === "timeshift"),
    tenant: hive.filter((s) => s.scope === "tenant" && s.project === project),
  };
}

export interface ResolvedSkillView {
  readonly name: string;
  readonly description: string;
  readonly winningScope: string;
  readonly locked: boolean;
  readonly trail: readonly { readonly scope: string; readonly outcome: string }[];
}

/** Why these skills: the governed, resolved set for a project, each with the trail that
 *  explains it. Bodies stay out — this is the surface, not the payload. */
export function whyResolve(root: string, project: string): ResolvedSkillView[] {
  const hive = readHive(hiveDirOf(root));
  return resolveSkills(byScope(hive, project)).map((r) => ({
    name: r.name,
    description: r.description,
    winningScope: r.winningScope,
    locked: r.locked,
    trail: r.trail.map((s) => ({ scope: s.scope, outcome: s.outcome })),
  }));
}

/** Why each skill is loaded for a task: route the project's set over the query and return
 *  the matched terms and scores. The same deterministic router the core uses. */
export function whyRoute(root: string, project: string, query: string): RouteResult {
  const hive = readHive(hiveDirOf(root));
  return route(surfacesOf(inheritSkills(byScope(hive, project))), { query });
}

/** What changed and who signed it: the one append-only event log, newest first. */
export function whyAudit(root: string) {
  return new FileAuditLog(join(hiveDirOf(root), "audit.jsonl")).read().slice().reverse();
}
