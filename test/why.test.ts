// "Why" surface verification (Goal-Driven Execution), P3.
//
// Goals: the screen's three answers are real projections of the engine over a real hive on
// disk — (1) why these skills (the governed resolved set + trail), (2) why loaded for a
// task (the router's matched terms), (3) the audit log, newest first. Built over a temp
// hive so the fs glue (readHive -> resolveSkills/route/FileAuditLog) is exercised end to end.

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { whyAudit, whyProjects, whyResolve, whyRoute } from "../server/why";

const root = mkdtempSync(join(tmpdir(), "timeshift-why-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function writeSkill(name: string, description: string, body: string): void {
  const dir = join(root, "hive", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`, "utf8");
}

mkdirSync(join(root, "hive"), { recursive: true });
writeSkill("house", "house coding standards and conventions", "House body.");
writeSkill("molo-ui", "molo teal brand design system", "Molo body.");
writeFileSync(
  join(root, "hive", "manifest.json"),
  JSON.stringify({ skills: [{ name: "house", scope: "timeshift" }, { name: "molo-ui", scope: "tenant", project: "molo" }] }),
  "utf8",
);
writeFileSync(
  join(root, "hive", "audit.jsonl"),
  [
    JSON.stringify({ seq: 0, type: "skill.admitted", tenantId: "molo", at: "2026-06-29T10:00:00Z", detail: { name: "molo-ui", by: "ad-1", role: "tenant-admin" } }),
    JSON.stringify({ seq: 1, type: "skills.materialized", tenantId: "molo", at: "2026-06-29T11:00:00Z", detail: { project: "molo", count: 2 } }),
  ].join("\n") + "\n",
  "utf8",
);

describe("why: the screen's data is a real projection of the engine over the hive", () => {
  it("lists the projects the hive holds skills for", () => {
    expect(whyProjects(root)).toEqual(["molo"]);
  });

  it("why these skills: the governed set, each won and locked, with its trail", () => {
    const rows = whyResolve(root, "molo");
    expect(rows.map((r) => r.name).sort()).toEqual(["house", "molo-ui"]);
    const house = rows.find((r) => r.name === "house")!;
    expect(house).toMatchObject({ winningScope: "timeshift", locked: true });
    expect(house.trail).toEqual([{ scope: "timeshift", outcome: "won" }]);
    expect(rows.find((r) => r.name === "molo-ui")!.winningScope).toBe("tenant");
  });

  it("why loaded for a task: only the trigger-matched skill routes in, with the why", () => {
    const result = whyRoute(root, "molo", "design the brand system");
    expect(result.selected.map((s) => s.name)).toEqual(["molo-ui"]);
    expect(result.selected[0]!.matched).toEqual(expect.arrayContaining(["design", "brand"]));
    expect(result.considered).toBe(2);
  });

  it("the audit log, newest first", () => {
    const events = whyAudit(root);
    expect(events.map((e) => e.type)).toEqual(["skills.materialized", "skill.admitted"]);
  });
});
