// The materializer: the seam between the hive and Claude's filesystem loader.
//
// Claude only ever discovers skills by reading SKILL.md files on disk, so the engine
// composes the set and projects it to disk, then the SessionStart hook asks Claude to
// re-scan (reloadSkills). The hive is the single source of truth; the skills directory
// Claude reads becomes a throwaway projection, rewritten each session for the current
// project.
//
// Filesystem I/O lives here, outside the pure engine (P1). planMaterialization is pure
// and tested; the disk functions are a thin wrapper that fails safe (see the hook).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inheritSkills, type Skill, type SkillsByScope } from "../src/index";

export type HiveScope = "timeshift" | "tenant";

export interface HiveSkill extends Skill {
  readonly scope: HiveScope;
  /** Set for tenant-scoped skills: the project this skill belongs to. */
  readonly project?: string;
}

export interface FilePlan {
  /** Relative to the target skills directory, e.g. "house-standards/SKILL.md". */
  readonly path: string;
  readonly content: string;
}

/**
 * Pure: given the whole hive and one project, the SKILL.md files to write.
 *
 * The cascade decides the set: the global (timeshift) skills plus this project's
 * (tenant) skills, deduped by name with the project winning (inheritSkills, the same
 * most-specific-wins used everywhere else). Switch project and the set changes, which
 * is how one global directory becomes per-project once the hook rewrites it each session.
 */
export function planMaterialization(hive: readonly HiveSkill[], project: string): FilePlan[] {
  const byScope: SkillsByScope = {
    timeshift: hive.filter((s) => s.scope === "timeshift"),
    tenant: hive.filter((s) => s.scope === "tenant" && s.project === project),
  };
  return inheritSkills(byScope).map((s) => ({ path: `${s.name}/SKILL.md`, content: toSkillMd(s) }));
}

function toSkillMd(s: Skill): string {
  return `---\nname: ${s.name}\ndescription: ${s.description}\n---\n\n${s.body}\n`;
}

/** The SessionStart hook contract: re-scan the skills directory after we have written. */
export function hookOutput(): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", reloadSkills: true } });
}

// ---- filesystem edge ----

interface ManifestEntry {
  readonly name: string;
  readonly scope: HiveScope;
  readonly project?: string;
}

export interface ProjectMap {
  readonly match: string;
  readonly project: string;
}

/** Resolve a working directory to a project key: the first map entry whose `match` is a
 *  substring of the path wins, else the directory's own name. Lets a real folder like
 *  "THHP companion 20260423" map to a clean key like "thhp". Pure and deterministic. */
export function resolveProject(cwd: string, map: readonly ProjectMap[]): string {
  const lower = cwd.toLowerCase();
  for (const m of map) {
    if (lower.includes(m.match.toLowerCase())) return m.project;
  }
  return basename(cwd).toLowerCase();
}

export function readProjects(hiveDir: string): ProjectMap[] {
  const path = join(hiveDir, "projects.json");
  if (!existsSync(path)) return [];
  const parsed: { map?: ProjectMap[] } = JSON.parse(readFileSync(path, "utf8"));
  return parsed.map ?? [];
}

export function readHive(hiveDir: string): HiveSkill[] {
  const manifest: { skills: ManifestEntry[] } = JSON.parse(readFileSync(join(hiveDir, "manifest.json"), "utf8"));
  return manifest.skills.map((entry) => {
    const md = readFileSync(join(hiveDir, "skills", entry.name, "SKILL.md"), "utf8");
    const { description, body } = parseSkillMd(md);
    return {
      name: entry.name,
      description,
      body,
      scope: entry.scope,
      ...(entry.project ? { project: entry.project } : {}),
    };
  });
}

/** Remove everything in the target skills directory. The directory is a managed
 *  projection of the hive, so switching projects must clear the previous set rather
 *  than letting it pile up. Operates only on the directory it is given. */
export function cleanTarget(targetDir: string): void {
  if (!existsSync(targetDir)) return;
  for (const entry of readdirSync(targetDir)) {
    rmSync(join(targetDir, entry), { recursive: true, force: true });
  }
}

export function materializeToDisk(plans: readonly FilePlan[], targetDir: string): string[] {
  const written: string[] = [];
  for (const plan of plans) {
    const full = join(targetDir, plan.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, plan.content, "utf8");
    written.push(plan.path);
  }
  return written;
}

/** Minimal frontmatter parse: `--- ... ---` then body. No YAML dependency. */
function parseSkillMd(md: string): { description: string; body: string } {
  const match = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { description: "", body: md.trim() };
  const front = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const line = front.split("\n").find((l) => l.startsWith("description:")) ?? "";
  return { description: line.replace(/^description:\s*/, "").trim(), body };
}
