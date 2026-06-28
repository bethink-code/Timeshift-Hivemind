// Materializer verification (Goal-Driven Execution).
//
// Goals: (1) the cascade scopes skills per project — a project sees the global skills
// plus its own, never another project's; (2) a project skill overrides a global one of
// the same name; (3) the materializer actually writes the resolved SKILL.md files to
// disk and emits the reloadSkills hook contract; (4) the real hive store parses.
//
// This writes only to an OS temp sandbox. It never touches ~/.claude/skills.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  hookOutput,
  materializeToDisk,
  planMaterialization,
  readHive,
  resolveProject,
  type HiveSkill,
} from "../tools/materialize";

const hive: HiveSkill[] = [
  { name: "house", description: "global", body: "GLOBAL", scope: "timeshift" },
  { name: "molo-ui", description: "molo", body: "MOLO", scope: "tenant", project: "molo" },
  { name: "thhp", description: "thhp", body: "THHP", scope: "tenant", project: "thhp" },
  { name: "house", description: "molo override", body: "MOLO-OVERRIDE", scope: "tenant", project: "molo" },
];

const contentFor = (plans: { path: string; content: string }[], path: string) =>
  plans.find((p) => p.path === path)?.content ?? "";

describe("materializer: the cascade scopes skills per project", () => {
  it("gives a project the global skills plus its own, never another project's", () => {
    const molo = planMaterialization(hive, "molo").map((p) => p.path);
    expect(molo).toEqual(["house/SKILL.md", "molo-ui/SKILL.md"]);
    expect(molo).not.toContain("thhp/SKILL.md");

    const thhp = planMaterialization(hive, "thhp").map((p) => p.path);
    expect(thhp).toEqual(["house/SKILL.md", "thhp/SKILL.md"]);
    expect(thhp).not.toContain("molo-ui/SKILL.md");
  });

  it("the global wins by default — a project cannot quietly override it (deny-by-default)", () => {
    const molo = planMaterialization(hive, "molo");
    expect(contentFor(molo, "house/SKILL.md")).toContain("GLOBAL");
    expect(contentFor(molo, "house/SKILL.md")).not.toContain("MOLO-OVERRIDE");
  });

  it("a project overrides only when the global is explicitly opened (delegated)", () => {
    const opened = hive.map((s) =>
      s.name === "house" && s.scope === "timeshift" ? { ...s, behaviour: "open" as const } : s,
    );
    expect(contentFor(planMaterialization(opened, "molo"), "house/SKILL.md")).toContain("MOLO-OVERRIDE");
  });
});

describe("materializer: writes to disk and speaks the hook contract", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "timeshift-skills-"));
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

  it("writes the resolved SKILL.md files with frontmatter and body", () => {
    const written = materializeToDisk(planMaterialization(hive, "molo"), sandbox);
    expect(written).toEqual(["house/SKILL.md", "molo-ui/SKILL.md"]);

    const houseMd = readFileSync(join(sandbox, "house", "SKILL.md"), "utf8");
    expect(houseMd).toContain("name: house");
    expect(houseMd).toContain("GLOBAL"); // top rules by default; the project copy is blocked
    expect(houseMd.startsWith("---\n")).toBe(true);
  });

  it("emits reloadSkills so Claude re-scans in the same session", () => {
    expect(JSON.parse(hookOutput())).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", reloadSkills: true },
    });
  });
});

describe("materializer: resolving a working directory to a project key", () => {
  const map = [
    { match: "THHP companion", project: "thhp" },
    { match: "Molo", project: "molo" },
  ];

  it("maps a real folder path to a clean project key", () => {
    expect(resolveProject("C:/LocalDev/THHP companion 20260423", map)).toBe("thhp");
    expect(resolveProject("C:/work/Molo V3", map)).toBe("molo");
  });

  it("falls back to the directory's own name when nothing matches", () => {
    expect(resolveProject("C:/LocalDev/some-other-app", map)).toBe("some-other-app");
  });
});

describe("materializer: the real migrated hive store parses", () => {
  it("reads the 9 real skills at ./hive with their scopes", () => {
    const skills = readHive("hive");
    const names = skills.map((s) => s.name);
    expect(skills).toHaveLength(9);
    expect(names).toContain("scaffold-project");
    expect(names).toContain("molo-ui-design");

    const byName = new Map(skills.map((s) => [s.name, s]));
    expect(byName.get("scaffold-project")?.scope).toBe("timeshift");
    expect(byName.get("molo-ui-design")?.scope).toBe("tenant");
    expect(byName.get("molo-ui-design")?.project).toBe("molo");
    // a description was parsed out of the real frontmatter
    expect((byName.get("code-review")?.description.length ?? 0)).toBeGreaterThan(0);
  });
});
