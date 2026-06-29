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
import { join } from "node:path";
import {
  cleanTarget,
  hookOutput,
  materializationEvent,
  materializeFailureEvent,
  materializeToDisk,
  planMaterialization,
  readHive,
  readProjects,
  resolveProject,
} from "./materialize";
import { FileAuditLog } from "./audit-log";
import type { EngineEvent } from "../src/index";

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

const args = parseArgs(process.argv.slice(2));
// Best-effort context for the audit, set as soon as it is known so a later failure can
// still name the project it was for.
let project = "unknown";

/** Record an event into the one audit log, but never let auditing break the session: an
 *  audit failure is swallowed, exactly like every other failure on the hook path. */
function safeAudit(event: Omit<EngineEvent, "seq">): void {
  try {
    new FileAuditLog(join(args.hive, "audit.jsonl")).append([event]);
  } catch {
    /* the audit is best-effort on the hook path; degrade to no record, never to no Claude */
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

function main(): void {
  if (!args.target) {
    process.stderr.write("materialize: --target is required; doing nothing\n");
    return; // exit 0, no-op
  }

  const cwd = cwdFromStdin(readStdin()) ?? process.cwd();
  project = args.projectOverride ?? resolveProject(cwd, readProjects(args.hive));

  const hive = readHive(args.hive);
  const plans = planMaterialization(hive, project);
  if (args.clean) cleanTarget(args.target);
  const written = materializeToDisk(plans, args.target);

  process.stderr.write(`materialize: wrote ${written.length} skill(s) for project "${project}"\n`);
  // only on success do we ask Claude to reload — the critical path first, then the record
  process.stdout.write(hookOutput());
  safeAudit(materializationEvent(project, written, isoNow()));
}

try {
  main();
} catch (err) {
  // Fail safe: never break the session. Leave existing skills exactly as they are, but no
  // longer silently: record why the session degraded to "no change".
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`materialize: skipped (${message})\n`);
  safeAudit(materializeFailureEvent(project, message, isoNow()));
}
process.exit(0);
