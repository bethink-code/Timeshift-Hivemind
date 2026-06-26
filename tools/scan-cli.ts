// Estate scan CLI: gather the real skill sources, classify the duplicates, print the
// report. Read-only.
//
//   node scan.mjs [--dev <devRoot>] [--out <file>]

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildInventory,
  classifyVariants,
  renderDrift,
  renderReport,
  scanAppBundle,
  scanProjects,
  scanSkillDir,
  type DriftItem,
  type SkillRef,
} from "./scan";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

const home = homedir();
const appdata = process.env.APPDATA ?? join(home, "AppData", "Roaming");
const devRoot = arg("--dev") ?? "C:/LocalDev";

const refs: SkillRef[] = [
  ...scanSkillDir(join(process.cwd(), "hive", "skills"), "hive"),
  ...scanAppBundle(join(appdata, "Claude", "local-agent-mode-sessions", "skills-plugin"), "app-bundle"),
  ...scanProjects(devRoot, "TimeShift HiveMind 20260626"),
];

const inv = buildInventory(refs);

// Step 3: read each duplicate's copies (one per source) and classify the drift.
const driftItems: DriftItem[] = inv.duplicates.map((row) => {
  const bySource = new Map<string, string>();
  for (const e of row.entries) if (!bySource.has(e.source)) bySource.set(e.source, e.path);
  const variants = [...bySource.entries()].map(([source, path]) => ({ source, content: readSafe(path) }));
  return { name: row.name, sources: row.sources, verdict: classifyVariants(variants) };
});

const report = `${renderReport(inv)}\n${renderDrift(driftItems)}`;
process.stdout.write(report);

const out = arg("--out");
if (out) {
  writeFileSync(out, report, "utf8");
  process.stderr.write(`\nscan: written to ${out}\n`);
}
