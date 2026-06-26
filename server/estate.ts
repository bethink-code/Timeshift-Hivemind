// Estate assembly for the interface: the read-only scan + drift classification, shaped
// for the Estate screen. Pure engine logic underneath (tools/scan); this just gathers
// the real sources and reads the duplicate copies so the screen can show the drift.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildInventory, classifyVariants, scanAppBundle, scanProjects, scanSkillDir } from "../tools/scan";

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** The Claude app's delivered skill bundle root. */
export function bundleRoot(): string {
  const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
  return join(appdata, "Claude", "local-agent-mode-sessions", "skills-plugin");
}

export function assembleEstate(root: string) {
  const refs = [
    ...scanSkillDir(join(root, "hive", "skills"), "hive"),
    ...scanAppBundle(bundleRoot()),
    ...scanProjects("C:/LocalDev", "TimeShift HiveMind 20260626"),
  ];
  const inv = buildInventory(refs);

  const duplicates = inv.duplicates.map((row) => {
    const bySource = new Map<string, string>();
    for (const e of row.entries) if (!bySource.has(e.source)) bySource.set(e.source, e.path);
    const variants = [...bySource.entries()].map(([source, path]) => ({ source, content: readSafe(path) }));
    return { name: row.name, sources: row.sources, verdict: classifyVariants(variants) };
  });

  return {
    bySource: inv.bySource,
    total: inv.total,
    rows: inv.rows.map((r) => ({ name: r.name, sources: r.sources })),
    duplicates,
  };
}
