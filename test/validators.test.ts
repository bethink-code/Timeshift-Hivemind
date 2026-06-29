// Phase 2 verification (Goal-Driven Execution).
//
// Goals: (1) constraints compile out of the resolved object from the closed
// vocabulary, (2) execution FAILS CLOSED to handoff on a fail-closed failure and never
// ships, (3) a self-declared rule can only ever be valid-but-wrong, never executable,
// and (4) a steer-needed constraint appears in BOTH the prompt and the validator set.
//
// Severity is the enforcement axis, decoupled from the governance lock: a constraint
// hands off because it is fail-closed, not because a lower scope cannot override it.

import { describe, expect, it } from "vitest";
import {
  compileValidators,
  resolve,
  runValidators,
  steeringLines,
  type CompiledValidator,
  type ValidatorSpec,
} from "../src/index";
import { compliance, engine, prov, treeOf } from "./helpers";

// A directly-built validator, for the execution tests.
const validator = (spec: ValidatorSpec, failClosed = true, steer = false): CompiledValidator =>
  ({ key: "k", spec, failClosed, steer, provenance: prov("x") });

describe("compile: constraints project out of the resolved object", () => {
  it("compiles an active fail-closed constraint, carrying its severity and steer flag", () => {
    const resolved = resolve(
      treeOf({ region: [compliance({ key: "compliance.language.official", kind: "constraint", steer: true, check: { type: "reply-in-official-language" }, defaultValue: true })] }),
    );
    const compiled = compileValidators(resolved);
    expect(compiled).toHaveLength(1);
    expect(compiled[0]).toMatchObject({ key: "compliance.language.official", failClosed: true, steer: true });
  });

  it("compiles nothing for an inactive, advisory constraint", () => {
    const resolved = resolve(
      treeOf({ tenant: [engine({ key: "style.no-links", scope: "tenant", kind: "constraint", enforcement: "advisory", check: { type: "forbid-pattern", pattern: "url" }, defaultValue: false })] }),
    );
    expect(compileValidators(resolved)).toHaveLength(0);
  });
});

describe("execute: fail-closed failures hand off", () => {
  it("hands off when a locked language check cannot be confirmed met", () => {
    const spec: ValidatorSpec = { type: "reply-in-official-language" };
    expect(runValidators([validator(spec)], "bonjour", { officialLanguage: "en", outputLanguage: "fr" }).status).toBe("handoff");
    expect(runValidators([validator(spec)], "hello", { officialLanguage: "en", outputLanguage: "en" }).status).toBe("pass");
    // detector missing: cannot confirm, so fail closed, not open
    expect(runValidators([validator(spec)], "hello", { officialLanguage: "en" }).status).toBe("handoff");
  });

  it("hands off on a forbidden substring and a leaked named pattern", () => {
    expect(runValidators([validator({ type: "forbid-substrings", any: ["guarantee", "cure"] })], "we guarantee results").status).toBe("handoff");
    expect(runValidators([validator({ type: "forbid-pattern", pattern: "za-id-number" })], "your id is 1234567890123").status).toBe("handoff");
    expect(runValidators([validator({ type: "forbid-pattern", pattern: "za-id-number" })], "no id here").status).toBe("pass");
  });

  it("hands off when no human-handoff path is available", () => {
    const spec: ValidatorSpec = { type: "handoff-available" };
    expect(runValidators([validator(spec)], "anything", { handoffAvailable: false }).status).toBe("handoff");
    expect(runValidators([validator(spec)], "anything", { handoffAvailable: true }).status).toBe("pass");
  });

  it("records an advisory failure without forcing a handoff", () => {
    const result = runValidators([validator({ type: "require-substring", value: "disclaimer" }, false)], "no footer here");
    expect(result.status).toBe("pass");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ failClosed: false });
  });
});

describe("steer: a steer-needed constraint is in BOTH the prompt and the validators (M1)", () => {
  it("renders a steering line only for steer:true, and validates either way", () => {
    const resolved = resolve(
      treeOf({
        timeshift: [engine({ key: "handoff.required", scope: "timeshift", kind: "constraint", steer: false, check: { type: "handoff-available" }, defaultValue: true })],
        region: [compliance({ key: "compliance.language.official", kind: "constraint", steer: true, check: { type: "reply-in-official-language" }, defaultValue: true })],
      }),
    );

    const lines = steeringLines(resolved);
    const compiledKeys = compileValidators(resolved).map((v) => v.key);

    // steer:true language rule: both a prompt line AND a validator
    expect(lines).toContain("Reply in the user's chosen official language.");
    expect(compiledKeys).toContain("compliance.language.official");

    // steer:false handoff rule: a validator only, no prompt line
    expect(lines).toHaveLength(1);
    expect(compiledKeys).toContain("handoff.required");
  });
});
