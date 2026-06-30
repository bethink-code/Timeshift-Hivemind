// The serve loop: drive a governed agent through one turn (the Molo proof slice).
//
// The engine already turns a tenant tree into a prompt PLUS an enforcement harness
// (render + validators). This composes them into one governed turn:
//   resolve → render → ASK THE MODEL → validate the OUTPUT → ship or hand off → attest.
//
// Pure (P1): the model is an INJECTED adapter, so this orchestration binds no provider,
// opens no socket, reads no clock. A model is just `complete(request) → Promise<text>`;
// the real Anthropic / Mistral / Gemini / Z.ai adapters live at the edge. LLM-agnostic by
// construction — the adapter consumes the engine's model-neutral prompt text and returns
// text, so swapping providers never touches this loop (V3 P1, ARCHITECTURE.md).
//
// Fail-closed (P8, Section 7): the output ships ONLY if every fail-closed validator
// passes. A failed check OR a model that errors becomes a handoff — never a silent ship,
// never a dead end. On handoff the output is withheld: a governed turn never leaks text
// that failed its own guardrails. A malformed tree is NOT a handoff — resolve() throws,
// because a broken configuration is a setup bug, not a turn the model can rescue.

import { resolve } from "./resolver";
import { renderPrompt } from "./render";
import { compileValidators, runValidators } from "./validators";
import type { ValidationContext, ValidationResult } from "./validators";
import type { Skill } from "./skill";
import type { SlotTree } from "./tree";
import type { EngineEvent } from "./provenance";

/** A model call reduced to its model-neutral essence: governed instructions + the user's
 *  task in, text out. Every provider is one implementation of this at the edge. */
export interface ModelRequest {
  /** The governed prompt the engine rendered — becomes the system instruction. */
  readonly system: string;
  /** The end-user's task for this turn — becomes the user message. */
  readonly user: string;
}

export interface ModelAdapter {
  /** provider:model, recorded in the trail so a turn names the model that ran it. */
  readonly id: string;
  /** Call the model. May reject on transport/auth failure; the loop turns a rejection
   *  into a fail-closed handoff rather than letting it throw out of serve. */
  complete(request: ModelRequest): Promise<string>;
}

export interface ServeRequest {
  /** An already tenant-scoped tree (the backbone's loadTree builds this; a fixture in the
   *  proof slice). */
  readonly tree: SlotTree;
  /** The end-user's task / query for this turn. */
  readonly task: string;
  readonly adapter: ModelAdapter;
  /** ISO timestamp from the edge — the core keeps no clock (L6). */
  readonly at: string;
  /** The agent's inherited skills; bodies load only when selected. */
  readonly skills?: readonly Skill[];
  /** Skill names the router selected for this task. */
  readonly selected?: readonly string[];
  /** Runtime facts the validators check against (languages, handoff availability). */
  readonly context?: ValidationContext;
}

export type ServeOutcome = "shipped" | "handoff";
export type HandoffReason = "validation" | "model-error";

export interface ServeResult {
  readonly outcome: ServeOutcome;
  /** The model's output — present ONLY when shipped. Withheld on handoff (it either failed
   *  a fail-closed check or never arrived). */
  readonly output?: string;
  /** The governed prompt the model was given, for the trail. */
  readonly prompt: string;
  /** The validator verdict. On a model-error handoff this is a synthetic fail-closed result. */
  readonly validation: ValidationResult;
  readonly handoffReason?: HandoffReason;
  /** The adapter id of the model that ran (or errored on) the turn. */
  readonly model: string;
  /** Append-only events for the durable sink — the edge owns the log, mirroring
   *  admissionEvents / materializationEvent. */
  readonly events: readonly Omit<EngineEvent, "seq">[];
}

/**
 * Drive one governed turn end to end.
 *
 * Composes the engine's existing faces (resolve, render, validators) around a single
 * injected effect — the model call — and adjudicates the result fail-closed. Returns the
 * outcome plus the events to attest; the caller appends them to its audit sink.
 */
export async function serve(request: ServeRequest): Promise<ServeResult> {
  const { tree, task, adapter, at, context } = request;

  const resolved = resolve(tree);
  const prompt = renderPrompt(resolved, {
    ...(request.skills ? { skills: request.skills } : {}),
    ...(request.selected ? { selected: request.selected } : {}),
  }).text;
  const validators = compileValidators(resolved);

  const tenantId = resolved.tenantId;
  const agentId = resolved.agentId;
  const events: Array<Omit<EngineEvent, "seq">> = [
    { type: "resolution.performed", tenantId, at, detail: { agentId, keys: resolved.keys.length } },
  ];

  let output: string;
  try {
    output = await adapter.complete({ system: prompt, user: task });
  } catch (err) {
    // Fail closed: no output means nothing can be confirmed, so hand off.
    const validation: ValidationResult = Object.freeze({
      status: "handoff",
      failures: Object.freeze([{ key: "model.call", reason: messageOf(err), failClosed: true }]),
    });
    events.push({ type: "turn.served", tenantId, at, detail: { agentId, model: adapter.id, outcome: "handoff", handoffReason: "model-error" } });
    return Object.freeze({ outcome: "handoff", prompt, validation, handoffReason: "model-error", model: adapter.id, events: Object.freeze(events) });
  }

  const validation = runValidators(validators, output, context ?? {});
  for (const f of validation.failures) {
    if (f.failClosed) events.push({ type: "validator.failed", tenantId, at, detail: { agentId, key: f.key, reason: f.reason } });
  }

  if (validation.status === "handoff") {
    events.push({ type: "turn.served", tenantId, at, detail: { agentId, model: adapter.id, outcome: "handoff", handoffReason: "validation", failures: validation.failures.length } });
    return Object.freeze({ outcome: "handoff", prompt, validation, handoffReason: "validation", model: adapter.id, events: Object.freeze(events) });
  }

  events.push({ type: "turn.served", tenantId, at, detail: { agentId, model: adapter.id, outcome: "shipped" } });
  return Object.freeze({ outcome: "shipped", output, prompt, validation, model: adapter.id, events: Object.freeze(events) });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
