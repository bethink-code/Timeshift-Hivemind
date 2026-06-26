// The materializer CLI: what the SessionStart hook runs.
//
// It resolves this session's skills out of the hive, writes them into the directory
// Claude reads, and prints the reloadSkills contract so Claude re-scans in-session.
//
// The SessionStart hook delivers its context as JSON on stdin, including the session's
// `cwd`. We read that to know which project we are in (mapped to a project key via
// hive/projects.json), so scoping works without hardcoding.
//
// FAIL SAFE. A hook runs on every session, so any error here must never break the
// session. On failure it logs to stderr, prints nothing on stdout, and exits 0,
// leaving whatever skills were already on disk in place. TimeShift breaking degrades
// to "no change", never to "no Claude".
//
// Usage:
//   node materialize-cli.mjs --hive <hiveDir> --target <skillsDir> [--project <name>] [--clean]
// With no --project, the project is resolved from the stdin cwd (or, absent stdin, the
// current directory) via hive/projects.json.

import { readSync } from "node:fs";
import {
  cleanTarget,
  hookOutput,
  materializeToDisk,
  planMaterialization,
  readHive,
  readProjects,
  resolveProject,
} from "./materialize";

interface Args {
  readonly hive: string;
  readonly target: string;
  readonly projectOverride: string | undefined;
  readonly clean: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    hive: get("--hive") ?? "hive",
    target: get("--target") ?? "",
    projectOverride: get("--project"),
    clean: argv.includes("--clean"),
  };
}

/** True for a Node errno-style error, narrowed without lying about domain types. */
function hasCode(e: unknown, code: string): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === code;
}

/** Read all of stdin synchronously, tolerating the pipe quirks on Windows (a plain
 *  readFileSync(0) does not reliably drain a piped stdin there). Never throws. */
function readStdin(): string {
  const buf = Buffer.alloc(1 << 16);
  const chunks: Buffer[] = [];
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (hasCode(e, "EAGAIN")) continue; // pipe not ready yet, retry
      if (hasCode(e, "EOF")) break; // end of a Windows pipe
      return ""; // no stdin (e.g. a tty) or any other issue: treat as absent
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function cwdFromStdin(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  try {
    const obj: { cwd?: unknown } = JSON.parse(raw);
    return typeof obj.cwd === "string" ? obj.cwd : undefined;
  } catch {
    return undefined;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    process.stderr.write("materialize: --target is required; doing nothing\n");
    return; // exit 0, no-op
  }

  const cwd = cwdFromStdin(readStdin()) ?? process.cwd();
  const project = args.projectOverride ?? resolveProject(cwd, readProjects(args.hive));

  const hive = readHive(args.hive);
  const plans = planMaterialization(hive, project);
  if (args.clean) cleanTarget(args.target);
  const written = materializeToDisk(plans, args.target);

  process.stderr.write(`materialize: wrote ${written.length} skill(s) for project "${project}"\n`);
  // only on success do we ask Claude to reload
  process.stdout.write(hookOutput());
}

try {
  main();
} catch (err) {
  // Fail safe: never break the session. Leave existing skills exactly as they are.
  process.stderr.write(`materialize: skipped (${err instanceof Error ? err.message : String(err)})\n`);
}
process.exit(0);
