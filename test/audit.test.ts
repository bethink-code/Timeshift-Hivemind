// Audit unification verification (Goal-Driven Execution), Step 5 / P2-P3.
//
// Goals: (1) admit, resolution, and materialisation all emit into ONE substrate, so a
// single overview accounts for every change rather than each tool keeping its own log;
// (2) an admission is recorded with who (the principal id and role) and why; (3) the
// durable JSONL sink is genuinely append-only — new events are new lines, seq continues
// across writes, and an earlier line is never rewritten.

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AppendOnlyLog,
  overview,
  recordResolution,
  resolve,
  type Principal,
} from "../src/index";
import { admissionEvents, applyDecisions, propose, type ExistingSkill, type IncomingSkill } from "../tools/admit";
import { materializationEvent, materializeFailureEvent } from "../tools/materialize";
import { FileAuditLog } from "../tools/audit-log";
import { engine, treeOf } from "./helpers";

const at = "2026-06-29T10:00:00Z";
const acmeAdmin: Principal = { id: "ad-acme", tenant: "acme", role: "tenant-admin" };

function admitOne(): ReturnType<typeof applyDecisions> {
  const hive: ExistingSkill[] = [];
  const incoming: IncomingSkill[] = [{ name: "dosage", scope: "tenant", project: "acme", content: "Dosing guidance." }];
  const proposals = propose(incoming, hive);
  return applyDecisions(incoming, proposals, [
    { name: "dosage", scope: "tenant", project: "acme", accept: true, by: acmeAdmin },
  ]);
}

describe("admit emits into the substrate with who and why", () => {
  it("maps each outcome to an EngineEvent carrying the principal and project", () => {
    const events = admissionEvents(admitOne(), at);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "skill.admitted",
      tenantId: "acme",
      detail: { name: "dosage", scope: "tenant", by: "ad-acme", role: "tenant-admin", project: "acme" },
    });
  });
});

describe("one substrate: admit, resolution, and materialisation share a log", () => {
  it("accounts for all three sources in a single tenant-scoped overview", () => {
    const log = new AppendOnlyLog();

    // resolution
    const resolved = resolve(treeOf({ tenant: [engine({ key: "x", scope: "tenant", kind: "fill", defaultValue: "y" })] }));
    recordResolution(log, resolved, at); // tenantId "tenant-acme"

    // admit (for the same tenant id, so the scoped overview sees it)
    for (const e of admissionEvents(admitOne(), at)) log.append({ ...e, tenantId: "tenant-acme" });

    // materialisation
    log.append({ ...materializationEvent("tenant-acme", ["dosage/SKILL.md"], at) });

    const o = overview(log, "tenant-acme");
    expect(o.byType["resolution.performed"]).toBe(1);
    expect(o.byType["skill.admitted"]).toBe(1);
    expect(o.byType["skills.materialized"]).toBe(1);
    // every type present even at zero: the readout is total, not merely populated
    expect(o.byType["materialize.failed"]).toBe(0);
    expect(Object.keys(o.byType)).toHaveLength(12);
  });
});

describe("FileAuditLog: durable and append-only by construction", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "timeshift-audit-"));
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
  const path = join(sandbox, "audit.jsonl");

  it("appends as JSONL, continues the seq across writes, and never rewrites a line", () => {
    const auditLog = new FileAuditLog(path);
    auditLog.append([materializationEvent("acme", ["a/SKILL.md"], at)]);
    auditLog.append([materializeFailureEvent("acme", "disk full", at)]);

    const all = auditLog.read();
    expect(all.map((e) => e.type)).toEqual(["skills.materialized", "materialize.failed"]);
    expect(all.map((e) => e.seq)).toEqual([0, 1]); // monotonic, gap-free, across two writes

    // on disk it is one event per line (the append-only shape), not a rewritten array
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("skills.materialized");
  });

  it("reads an absent log as empty", () => {
    expect(new FileAuditLog(join(sandbox, "nope.jsonl")).read()).toEqual([]);
  });
});
