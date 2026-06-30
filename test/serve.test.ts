// The serve loop (the Molo proof slice): the engine drives one governed turn.
//
// The model is the one injected effect, so a fake adapter is the right test double here —
// these tests pin the ORCHESTRATION, not a provider: given what the model said (or that it
// fell over), does the loop ship, hand off, withhold, and attest correctly? Fail-closed is
// the invariant under test: output ships only when every fail-closed validator passes.

import { describe, it, expect } from "vitest";
import { serve, AppendOnlyLog, overview, type ModelAdapter, type ModelRequest } from "../src/index";
import { treeOf, personality, engine } from "./helpers";

const AT = "2026-06-30T00:00:00Z";

// An agent with an identity fill (so the prompt has voice) and a top-level fail-closed
// safety constraint (so an offending output must hand off).
const tree = treeOf({
  agent: [personality({ key: "identity.tone", defaultValue: "warm and plain" })],
  timeshift: [
    engine({ key: "safety.no-guarantees", scope: "timeshift", kind: "constraint", check: { type: "forbid-substrings", any: ["guarantee"] }, defaultValue: true }),
  ],
});

const returning = (text: string): ModelAdapter => ({ id: "fake:echo", complete: async () => text });
const down: ModelAdapter = { id: "fake:down", complete: async () => { throw new Error("502 upstream"); } };

describe("serve: a clean output ships", () => {
  it("ships the output and attests the turn", async () => {
    const result = await serve({ tree, task: "explain my benefits", adapter: returning("Here is a plain, careful explanation."), at: AT });

    expect(result.outcome).toBe("shipped");
    expect(result.output).toBe("Here is a plain, careful explanation.");
    expect(result.validation.status).toBe("pass");
    expect(result.model).toBe("fake:echo");
    expect(result.events.map((e) => e.type)).toEqual(["resolution.performed", "turn.served"]);
  });

  it("gives the model the GOVERNED prompt as system and the task as user", async () => {
    let captured: ModelRequest | undefined;
    const capture: ModelAdapter = { id: "fake:capture", complete: async (req) => { captured = req; return "fine"; } };

    await serve({ tree, task: "what can I claim?", adapter: capture, at: AT });

    expect(captured?.user).toBe("what can I claim?");
    expect(captured?.system).toContain("warm and plain"); // the resolved identity reached the prompt
  });
});

describe("serve: fail-closed handoff", () => {
  it("hands off and WITHHOLDS an output that fails a fail-closed validator", async () => {
    const result = await serve({ tree, task: "will this work?", adapter: returning("We guarantee a full refund."), at: AT });

    expect(result.outcome).toBe("handoff");
    expect(result.handoffReason).toBe("validation");
    expect(result.output).toBeUndefined(); // never leak text that failed its own guardrails
    expect(result.events.map((e) => e.type)).toContain("validator.failed");
    expect(result.events.at(-1)?.type).toBe("turn.served");
  });

  it("hands off when the model errors — no output, model-error reason, no validator.failed", async () => {
    const result = await serve({ tree, task: "anything", adapter: down, at: AT });

    expect(result.outcome).toBe("handoff");
    expect(result.handoffReason).toBe("model-error");
    expect(result.output).toBeUndefined();
    expect(result.validation.failures[0]?.key).toBe("model.call");
    expect(result.events.some((e) => e.type === "validator.failed")).toBe(false);
  });
});

describe("serve: the turn feeds the one audit substrate", () => {
  it("emits events that append cleanly and count in the overview", async () => {
    const result = await serve({ tree, task: "hello", adapter: returning("a clean reply"), at: AT });

    const log = new AppendOnlyLog();
    for (const e of result.events) log.append(e);

    expect(overview(log).byType["turn.served"]).toBe(1);
    expect(overview(log).byType["resolution.performed"]).toBe(1);
  });
});
