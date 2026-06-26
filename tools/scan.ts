// Estate scan: a read-only inventory of every skill the hive cares about, across all
// the places they actually live, with overlaps flagged AND classified as identical or
// diverged. This is steps 1-3 of the onboarding pipeline (ESTATE-ONBOARDING.md), the
// oversight idea (Section 9) pointed at the real filesystem. It changes nothing.
//
// Sources scanned: the hive itself, the Claude app's delivered craft bundle, and every
// dev project. The official Anthropic marketplace is deliberately excluded (BACKLOG.md).
//
// Filesystem walking and reading are the edge; buildInventory, classifyVariants and the
// renderers are pure and tested.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface SkillRef {
  readonly name: string;
  readonly source: string;
  readonly path: string;
}

export interface SkillEntry {
  readonly source: string;
  readonly path: string;
}

export interface SkillRow {
  readonly name: string;
  readonly sources: readonly string[];
  readonly entries: readonly SkillEntry[];
}

export interface Inventory {
  readonly rows: readonly SkillRow[];
  readonly bySource: ReadonlyArray<{ readonly source: string; readonly count: number }>;
  readonly duplicates: readonly SkillRow[];
  readonly total: number;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---- pure: inventory ----

export function buildInventory(refs: readonly SkillRef[]): Inventory {
  const byName = new Map<string, SkillEntry[]>();
  for (const r of refs) {
    const arr = byName.get(r.name) ?? [];
    arr.push({ source: r.source, path: r.path });
    byName.set(r.name, arr);
  }

  const rows: SkillRow[] = [...byName.entries()]
    .map(([name, entries]) => ({
      name,
      sources: [...new Set(entries.map((e) => e.source))].sort(cmp),
      entries,
    }))
    .sort((a, b) => cmp(a.name, b.name));

  const namesPerSource = new Map<string, Set<string>>();
  for (const r of refs) {
    const s = namesPerSource.get(r.source) ?? new Set<string>();
    s.add(r.name);
    namesPerSource.set(r.source, s);
  }
  const bySource = [...namesPerSource.entries()]
    .map(([source, names]) => ({ source, count: names.size }))
    .sort((a, b) => cmp(a.source, b.source));

  const duplicates = rows.filter((r) => r.sources.length > 1);
  return { rows, bySource, duplicates, total: rows.length };
}

// ---- pure: drift classification ----

export interface Variant {
  readonly source: string;
  readonly content: string;
}

export interface DriftVerdict {
  readonly status: "identical" | "diverged";
  readonly summary: string;
}

/** Whitespace-normalise so trivial formatting differences do not read as drift. */
function normalise(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

/** Decide whether copies of one skill are the same or have drifted, with a shared-line
 *  ratio as the signal. Identical means a redundant copy; diverged means a real choice:
 *  deliberate override or stale. */
export function classifyVariants(variants: readonly Variant[]): DriftVerdict {
  const norm = variants.map((v) => normalise(v.content));
  const first = norm[0] ?? "";
  const byteEqual = norm.every((n) => n === first);

  const lineSets = norm.map((n) => new Set(n.split("\n").filter((l) => l.length > 0)));
  const union = new Set<string>();
  for (const s of lineSets) for (const l of s) union.add(l);
  let shared = 0;
  for (const l of union) {
    if (lineSets.every((s) => s.has(l))) shared += 1;
  }
  const ratio = union.size === 0 ? 1 : shared / union.size;
  const sizes = variants.map((v, i) => `${v.source} ${(norm[i] ?? "").split("\n").length}L`);

  if (byteEqual) return { status: "identical", summary: "byte-identical after whitespace normalisation" };
  // every meaningful line is shared; only blank lines or ordering differ — redundant.
  if (ratio === 1) return { status: "identical", summary: `same content, formatting only (${sizes.join(", ")})` };
  const differ = union.size - shared;
  // floor, never round: a diverged copy must never display as 100%.
  return {
    status: "diverged",
    summary: `${Math.floor(ratio * 100)}% shared, ${differ} line${differ === 1 ? "" : "s"} differ (${sizes.join(", ")})`,
  };
}

// ---- pure: rendering ----

export function renderReport(inv: Inventory): string {
  const lines: string[] = [];
  lines.push("# Skill estate scan");
  lines.push("");
  lines.push(`${inv.total} distinct skills across ${inv.bySource.length} sources. The official Anthropic marketplace is excluded by design.`);
  lines.push("");
  lines.push("## By source");
  for (const s of inv.bySource) lines.push(`- ${s.source}: ${s.count}`);
  lines.push("");
  lines.push("## Every skill");
  for (const r of inv.rows) lines.push(`- ${r.name} — ${r.sources.join(", ")}`);
  lines.push("");
  return lines.join("\n");
}

export interface DriftItem {
  readonly name: string;
  readonly sources: readonly string[];
  readonly verdict: DriftVerdict;
}

export function renderDrift(items: readonly DriftItem[]): string {
  const lines: string[] = ["## Duplicates, classified"];
  if (items.length === 0) {
    lines.push("- none");
  } else {
    const identical = items.filter((i) => i.verdict.status === "identical");
    const diverged = items.filter((i) => i.verdict.status === "diverged");
    lines.push(`${diverged.length} diverged (a real decision), ${identical.length} identical (redundant copies).`);
    lines.push("");
    for (const it of items) {
      const flag = it.verdict.status === "diverged" ? "DIVERGED" : "identical";
      lines.push(`- **${it.name}** (${it.sources.join(", ")}): ${flag} — ${it.verdict.summary}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

// ---- filesystem edge ----

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(p: string): string[] {
  try {
    return existsSync(p) ? readdirSync(p) : [];
  } catch {
    return [];
  }
}

/** Skills as immediate subdirectories of `root` that each contain a SKILL.md. */
export function scanSkillDir(root: string, source: string): SkillRef[] {
  const out: SkillRef[] = [];
  for (const entry of safeReaddir(root)) {
    const dir = join(root, entry);
    const md = join(dir, "SKILL.md");
    if (isDir(dir) && existsSync(md)) out.push({ name: entry, source, path: md });
  }
  return out;
}

/** The Claude app's delivered bundle: <root>/<uuid>/<uuid>/skills/<name>/SKILL.md.
 *  Deduped by name across the (possibly several) bundle directories. */
export function scanAppBundle(bundleRoot: string, source = "app-bundle"): SkillRef[] {
  const out: SkillRef[] = [];
  const seen = new Set<string>();
  for (const a of safeReaddir(bundleRoot)) {
    for (const b of safeReaddir(join(bundleRoot, a))) {
      for (const ref of scanSkillDir(join(bundleRoot, a, b, "skills"), source)) {
        if (!seen.has(ref.name)) {
          seen.add(ref.name);
          out.push(ref);
        }
      }
    }
  }
  return out;
}

/** Every project under devRoot, scanning both .claude/skills and .agents/skills. */
export function scanProjects(devRoot: string, skip: string): SkillRef[] {
  const out: SkillRef[] = [];
  for (const proj of safeReaddir(devRoot)) {
    const projDir = join(devRoot, proj);
    if (!isDir(projDir) || proj === skip) continue;
    for (const sub of [".claude/skills", ".agents/skills"]) {
      out.push(...scanSkillDir(join(projDir, sub), `project:${proj}`));
    }
  }
  return out;
}
