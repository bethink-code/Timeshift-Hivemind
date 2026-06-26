// Onboarding for the interface: the admit flow (tools/admit) wired to the file-hive.
// buildOnboarding proposes admitting the estate's skills into the hive (changing
// nothing); acceptOnboarding applies ONLY the human-confirmed decisions, writes the
// confirmed skills into the hive, and appends the audit trail. The authority gate lives
// in tools/admit.applyDecisions: a decision only takes when its `by` matches the scope's
// required confirmer.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  applyDecisions,
  propose,
  type AdmitScope,
  type AuditEntry,
  type Decision,
  type ExistingSkill,
  type IncomingSkill,
} from "../tools/admit";
import { scanAppBundle, scanProjects } from "../tools/scan";
import { bundleRoot } from "./estate";

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

interface ManifestEntry {
  name: string;
  scope: AdmitScope;
  project?: string;
}

function readManifest(hiveDir: string): { skills: ManifestEntry[] } {
  return JSON.parse(readFileSync(join(hiveDir, "manifest.json"), "utf8"));
}

function existingFromHive(hiveDir: string): ExistingSkill[] {
  return readManifest(hiveDir).skills.map((e) => ({
    name: e.name,
    scope: e.scope,
    content: readSafe(join(hiveDir, "skills", e.name, "SKILL.md")),
    ...(e.project ? { project: e.project } : {}),
  }));
}

/** The estate's skills as admit candidates: the app bundle at root scope, project
 *  skills at tenant scope (project taken from the source label). */
function incomingFromEstate(): IncomingSkill[] {
  const out: IncomingSkill[] = [];
  for (const r of scanAppBundle(bundleRoot())) {
    out.push({ name: r.name, scope: "timeshift", content: readSafe(r.path) });
  }
  for (const r of scanProjects("C:/LocalDev", "TimeShift HiveMind 20260626")) {
    const project = r.source.startsWith("project:") ? r.source.slice("project:".length) : undefined;
    out.push({ name: r.name, scope: "tenant", content: readSafe(r.path), ...(project ? { project } : {}) });
  }
  return out;
}

export function buildOnboarding(root: string) {
  const incoming = incomingFromEstate();
  const proposals = propose(incoming, existingFromHive(join(root, "hive")));
  return { incoming, proposals };
}

export function acceptOnboarding(root: string, decisions: Decision[]) {
  const hiveDir = join(root, "hive");
  const { incoming, proposals } = buildOnboarding(root);
  const result = applyDecisions(incoming, proposals, decisions);

  const manifest = readManifest(hiveDir);
  for (const s of result.applied) {
    const md = join(hiveDir, "skills", s.name, "SKILL.md");
    mkdirSync(dirname(md), { recursive: true });
    writeFileSync(md, s.content, "utf8");
    const present = manifest.skills.some((e) => e.name === s.name && e.scope === s.scope && e.project === s.project);
    if (!present) manifest.skills.push({ name: s.name, scope: s.scope, ...(s.project ? { project: s.project } : {}) });
  }
  writeFileSync(join(hiveDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  appendAudit(hiveDir, result.audit, isoNow());
  return result;
}

function isoNow(): string {
  return new Date().toISOString();
}

function appendAudit(hiveDir: string, entries: readonly AuditEntry[], at: string): void {
  const path = join(hiveDir, "audit.json");
  const parsed: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const log: unknown[] = Array.isArray(parsed) ? parsed : [];
  for (const e of entries) log.push({ at, ...e });
  writeFileSync(path, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}
