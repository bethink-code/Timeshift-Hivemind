// Estate scan verification (Goal-Driven Execution).
//
// Goals: (1) the inventory groups skills by name and flags any in more than one source;
// (2) the drift classifier reads the copies and decides identical vs diverged — the
// step that turns "you can't tell" into a fact; (3) the report surfaces it. Pure only.

import { describe, expect, it } from "vitest";
import {
  buildInventory,
  classifyVariants,
  renderDrift,
  renderReport,
  type SkillRef,
} from "../tools/scan";

const refs: SkillRef[] = [
  { name: "code-review", source: "hive", path: "/hive/code-review/SKILL.md" },
  { name: "code-review", source: "project:Lekana", path: "/Lekana/.claude/skills/code-review/SKILL.md" },
  { name: "simplify", source: "hive", path: "/hive/simplify/SKILL.md" },
  { name: "pdf", source: "app-bundle", path: "/bundle/pdf/SKILL.md" },
  { name: "fuel-rec", source: "app-bundle", path: "/bundle/fuel-rec/SKILL.md" },
  { name: "fuel-rec", source: "project:Lekana", path: "/Lekana/.claude/skills/fuel-rec/SKILL.md" },
];

describe("scan: the inventory groups by name and flags overlap", () => {
  const inv = buildInventory(refs);

  it("counts distinct skills and per-source distinct names", () => {
    expect(inv.total).toBe(4);
    expect(inv.bySource).toEqual([
      { source: "app-bundle", count: 2 },
      { source: "hive", count: 2 },
      { source: "project:Lekana", count: 2 },
    ]);
  });

  it("flags exactly the skills present in more than one source", () => {
    expect(inv.duplicates.map((r) => r.name)).toEqual(["code-review", "fuel-rec"]);
    expect(inv.rows.find((r) => r.name === "code-review")?.sources).toEqual(["hive", "project:Lekana"]);
  });
});

describe("scan: the drift classifier reads the copies and decides", () => {
  it("calls identical copies identical, ignoring trivial whitespace", () => {
    const v = classifyVariants([
      { source: "hive", content: "---\nname: x\n---\nDo the thing.  \n" },
      { source: "project:Lekana", content: "---\nname: x\n---\nDo the thing.\r\n" },
    ]);
    expect(v.status).toBe("identical");
  });

  it("calls genuinely different copies diverged, with a shared-line ratio", () => {
    const v = classifyVariants([
      { source: "hive", content: "---\nname: x\n---\nStep one.\nStep two.\nStep three." },
      { source: "project:Lekana", content: "---\nname: x\n---\nStep one.\nStep two ALTERED.\nStep four." },
    ]);
    expect(v.status).toBe("diverged");
    expect(v.summary).toMatch(/% shared, \d+ lines? differ/);
  });
});

describe("scan: rendering", () => {
  it("renders the inventory and a classified-duplicates section", () => {
    const report = renderReport(buildInventory(refs));
    expect(report).toContain("## By source");
    expect(report).toContain("## Every skill");

    const drift = renderDrift([
      { name: "code-review", sources: ["hive", "project:Lekana"], verdict: { status: "diverged", summary: "60% shared lines" } },
    ]);
    expect(drift).toContain("Duplicates, classified");
    expect(drift).toContain("**code-review** (hive, project:Lekana): DIVERGED");
  });
});
