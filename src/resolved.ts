// The resolved object: what the resolver emits, and the substrate all six faces read.
//
// The same object serves the prompt, the validators, the attestation, the wizards,
// and the oversight surface (Section 10). It is built once per (tenant, agent, scope
// versions) and is deterministic (L6): the attestation is only trustworthy because
// this is reproducible. It carries not just the winning value but the full trail of
// how it won, so "why is it like this?" is answerable for any agent (Section 9).

import type { Enforcement, Kind, Provenance, Register, Scope, SlotValue } from "./slot";
import type { ValidatorSpec } from "./vocabulary";

/** One scope's contribution to a key during resolution, recorded for the trail. */
export interface ResolutionStep {
  readonly scope: Scope;
  readonly value: SlotValue;
  readonly behaviour: "locked" | "open";
  /** What became of this scope's say on the key. */
  readonly outcome: "won" | "overridden" | "blocked-by-lock";
}

/** One key after the cascade has been adjudicated (L4): a single winner, no losers
 *  left in the output, plus the trail that explains the win. */
export interface ResolvedKey {
  readonly key: string;
  readonly value: SlotValue;
  readonly winningScope: Scope;
  /** Governance: is this key locked against a lower-scope override (Law 1)? Under
   *  deny-by-default most keys are; the trail says whether a lock actually denied one. */
  readonly locked: boolean;
  readonly provenance: Provenance;
  /** Every scope that spoke on this key, in cascade order; the winner's step last. */
  readonly trail: readonly ResolutionStep[];
  /** What the winning slot compiles into; lets each face read only its own keys. */
  readonly kind: Kind;
  /** The register of the winning slot; the prompt groups by it, oversight reports it. */
  readonly register: Register;
  /** Constraint keys only: the declarative check the validator face compiles. */
  readonly check?: ValidatorSpec;
  /** Constraint keys only: whether this also renders a prompt steering line. */
  readonly steer?: boolean;
  /** Constraint keys only: enforcement severity, defaulted; drives fail-closed handoff. */
  readonly enforcement?: Enforcement;
}

/** The whole agent, resolved. Deterministic for a given input (L6). */
export interface ResolvedObject {
  readonly tenantId: string;
  readonly agentId: string;
  readonly scopeVersions: Readonly<Record<Scope, string>>;
  readonly keys: readonly ResolvedKey[];
}
