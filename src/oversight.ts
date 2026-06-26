// Oversight: the resolved object projected for the owner (face #6, Section 9).
//
// "The engine may not do anything it cannot show." This file adds no new data model.
// It projects what already exists: the resolved object's trail, each key's provenance,
// the compiled validators, the inherited skills, and the append-only event log. The
// debug surface and the oversight surface are the same surface (Section 9), so the
// "explain this agent" output below is both.
//
// Complete before deep: these projections are total and plain, not pretty. A flat,
// honest readout of 100% beats a beautiful view of 70%, because the missing 30% is
// exactly the unknown the law forbids.

import type { AppendOnlyLog, EngineEvent, EngineEventType } from "./provenance";
import type { ResolvedObject, ResolutionStep } from "./resolved";
import type { Kind, Register, Scope, SlotValue } from "./slot";
import type { Skill } from "./skill";
import { compileValidators, describeValidator } from "./validators";

/** One key, fully accounted for: its value, who set it, what it beat, what watches it. */
export interface KeyExplanation {
  readonly key: string;
  readonly register: Register;
  readonly kind: Kind;
  readonly value: SlotValue;
  readonly winningScope: Scope;
  readonly locked: boolean;
  readonly authoredBy: string;
  readonly version: string;
  readonly trail: readonly ResolutionStep[];
}

export interface ValidatorWatch {
  readonly key: string;
  readonly rule: string;
  readonly locked: boolean;
}

/** The answer to "why is this agent like this?": skills (available and loaded), the
 *  scopes and answers behind every key, the mandates that stopped the cascade, the
 *  validators watching, all at their versions. */
export interface AgentExplanation {
  readonly tenantId: string;
  readonly agentId: string;
  readonly scopeVersions: Readonly<Record<Scope, string>>;
  readonly keys: readonly KeyExplanation[];
  readonly mandates: readonly string[];
  readonly validators: readonly ValidatorWatch[];
  readonly skillsAvailable: readonly string[];
  readonly skillsLoaded: readonly string[];
}

export interface ExplainOptions {
  readonly skills?: readonly Skill[];
  readonly selected?: readonly string[];
}

export function explainAgent(resolved: ResolvedObject, options: ExplainOptions = {}): AgentExplanation {
  const inherited = options.skills ?? [];
  const selected = new Set(options.selected ?? []);
  const compiled = compileValidators(resolved);

  const keys: KeyExplanation[] = resolved.keys.map((k) => ({
    key: k.key,
    register: k.register,
    kind: k.kind,
    value: k.value,
    winningScope: k.winningScope,
    locked: k.locked,
    authoredBy: k.provenance.authority,
    version: k.provenance.version,
    trail: k.trail,
  }));

  return {
    tenantId: resolved.tenantId,
    agentId: resolved.agentId,
    scopeVersions: resolved.scopeVersions,
    keys: Object.freeze(keys),
    mandates: Object.freeze(resolved.keys.filter((k) => k.locked).map((k) => k.key)),
    validators: Object.freeze(compiled.map((v) => ({ key: v.key, rule: describeValidator(v.spec), locked: v.locked }))),
    skillsAvailable: Object.freeze(inherited.map((s) => s.name)),
    skillsLoaded: Object.freeze(inherited.filter((s) => selected.has(s.name)).map((s) => s.name)),
  };
}

/**
 * Emit a resolution's account into the log, so a resolution is never silent (Section 9).
 *
 * The resolver is pure and has no clock; this is the deliberate, explicit step that
 * records what it did, with a caller-supplied timestamp to keep it deterministic. One
 * event for the resolution, and one for each mandate that stopped a cascade.
 */
export function recordResolution(log: AppendOnlyLog, resolved: ResolvedObject, at: string): void {
  log.append({
    type: "resolution.performed",
    tenantId: resolved.tenantId,
    at,
    detail: { agentId: resolved.agentId, keys: resolved.keys.length },
  });
  for (const k of resolved.keys) {
    if (!k.locked) continue;
    log.append({
      type: "mandate.stopped-cascade",
      tenantId: resolved.tenantId,
      at,
      detail: { agentId: resolved.agentId, key: k.key, winningScope: k.winningScope },
      provenance: k.provenance,
    });
  }
}

export interface Overview {
  readonly totalEvents: number;
  readonly byType: Readonly<Record<EngineEventType, number>>;
  readonly events: readonly EngineEvent[];
}

/**
 * The total readout: every event the engine emitted, counted by type and listed.
 *
 * `byType` is a full literal of every event type, so an unused type reads as 0 rather
 * than being absent: the readout is complete, not merely populated. Tenant-scoped when
 * a tenantId is given, so one tenant's account is never shown for another.
 */
export function overview(log: AppendOnlyLog, tenantId?: string): Overview {
  const events = tenantId === undefined ? log.entries() : log.entriesForTenant(tenantId);
  const byType: Record<EngineEventType, number> = {
    "slot.authored": 0,
    "slot.answered": 0,
    "resolution.performed": 0,
    "mandate.stopped-cascade": 0,
    "validator.failed": 0,
    "version.bumped": 0,
    "tenant.onboarded": 0,
  };
  for (const e of events) byType[e.type] += 1;
  return { totalEvents: events.length, byType: Object.freeze(byType), events };
}
