// The slot: the atom of the engine (Section 5).
//
// One object expresses every point of variability the resolver can address. The
// field set is a day-one shape (#2): every slot carries all its fields from the
// first write, because retrofitting them onto a running engine is the forensic
// mess version stamps exist to prevent.
//
// The resolution laws are encoded in these types where TypeScript can express
// them, so illegal states cannot be authored, not merely discouraged:
//   - L7 (compliance is always locked): ComplianceSlot.behaviour is fixed to "mandate".
//   - L9 (no behaviour-bearing slot reaches the agent): PersonalitySlot.kind is fixed
//     to "fill", and "choice" can occur only in the engine register.

import type { ValidatorSpec } from "./vocabulary";

/** Register decides who may author a slot and who may ever see it (Section 3). */
export type Register = "engine" | "compliance" | "personality";

/** The four scopes, broadest to narrowest (Section 2). */
export type Scope = "timeshift" | "region" | "tenant" | "agent";

/** What a slot compiles into (Section 5). */
export type Kind = "fill" | "constraint" | "choice";

/** Resolution behaviour: a default cascades (L2), a mandate locks the cascade (L3). */
export type ResolutionBehaviour = "default" | "mandate";

/** How a narrower scope's list combines with a broader one (L8). List slots only. */
export type Merge = "replace" | "append";

/** The value a slot resolves to. A list value is what makes `merge` meaningful (L8). */
export type SlotValue = string | boolean | readonly string[];

/** Who authored or answered a slot, on what authority, at what version (Section 5).
 *  The field the attestation and the audit trail both read (Section 7). */
export interface Provenance {
  /** e.g. "platform", "tenant-author", "agent-owner", "business-self-declared". */
  readonly authority: string;
  /** e.g. "POPIA-aligned". Optional; present mostly on compliance slots. */
  readonly basis?: string;
  /** The version under which this was authored or answered. */
  readonly version: string;
}

/** The closed vocabulary of answer types. The exact set is an open question in the
 *  spec (Section 13); modelling it as a discriminated union keeps it closed by
 *  construction, which is the precondition for the anti-escalation guarantee:
 *  free text is the vulnerability (Section 7). */
export type AnswerShape =
  | { readonly type: "enum"; readonly options: readonly string[] }
  | { readonly type: "shortText"; readonly maxLength: number; readonly pattern?: string }
  | { readonly type: "boolean" };

/** The constrained question put to a human when a slot is elicited (Section 5).
 *  The answer-shape, not the question, is the security control. */
export interface Interview {
  readonly question: string;
  readonly answerShape: AnswerShape;
  readonly required: boolean;
}

interface SlotCommon {
  /** A stable, unique address. The resolver resolves by this, never by reading
   *  prose (L1, L5). */
  readonly key: string;
  /** Who authored or answered this, on what authority, at what version. */
  readonly provenance: Provenance;
  /** The template version this answer was given under, so renamed or removed slots
   *  can be migrated rather than silently orphaned (#2, Section 8). */
  readonly answerVersionStamp: string;
  /** The value the slot falls through to when no one answers (Section 5). */
  readonly defaultValue: SlotValue;
  /** How the slot is elicited; null when platform-authored and not interviewed. */
  readonly interview: Interview | null;
}

/** Engine register: how-it-works. Owned upward, never authored by the client.
 *  Spans two scopes: the platform's universal mechanism (timeshift) and a company's
 *  vertical behaviour (tenant). The only register that may carry a `choice` (L9). */
export interface EngineSlot extends SlotCommon {
  readonly register: "engine";
  readonly scope: "timeshift" | "tenant";
  readonly kind: Kind;
  readonly behaviour: ResolutionBehaviour;
  /** List-valued slots only (L8). */
  readonly merge?: Merge;
  /** Constraint slots only: does the rule also render a steering line (Section 6)? */
  readonly steer?: boolean;
  /** Constraint slots only: the declarative check from the closed vocabulary (#3). */
  readonly check?: ValidatorSpec;
}

/** Compliance register: externally required. Authored outside the tree, imposed at
 *  region scope, and locked by construction (L7) because authority runs opposite to
 *  specificity. Never a `choice`. */
export interface ComplianceSlot extends SlotCommon {
  readonly register: "compliance";
  readonly scope: "region";
  readonly kind: "fill" | "constraint";
  readonly behaviour: "mandate";
  readonly merge?: Merge;
  readonly steer?: boolean;
  readonly check?: ValidatorSpec;
}

/** Personality register: who-it-is. Thin by law. The only register the agent scope
 *  authors, and a `fill` only (L9): no behaviour-bearing kind is ever pointed at the
 *  agent, so a staff member cannot be asked a how-it-works question. */
export interface PersonalitySlot extends SlotCommon {
  readonly register: "personality";
  readonly scope: "agent";
  readonly kind: "fill";
  readonly behaviour: ResolutionBehaviour;
}

export type Slot = EngineSlot | ComplianceSlot | PersonalitySlot;

/** The two field-conditional invariants TypeScript cannot express at the type level
 *  (they depend on the runtime value's shape), checked here so the authoring tool and
 *  the resolver share one definition of a well-formed slot. The register/scope/kind/
 *  behaviour laws (L7, L9) are already enforced by the types above. */
export function slotInvariants(slot: Slot): readonly string[] {
  const problems: string[] = [];

  const isList = Array.isArray(slot.defaultValue);
  if ("merge" in slot && slot.merge !== undefined && !isList) {
    problems.push(`${slot.key}: merge is for list-valued slots only (L8)`);
  }

  const steer = "steer" in slot ? slot.steer : undefined;
  if (steer !== undefined && slot.kind !== "constraint") {
    problems.push(`${slot.key}: steer is for constraint slots only (Section 5)`);
  }

  const hasCheck = "check" in slot && slot.check !== undefined;
  if (slot.kind === "constraint" && !hasCheck) {
    problems.push(`${slot.key}: a constraint slot needs a declarative check (Section 7)`);
  }
  if (slot.kind !== "constraint" && hasCheck) {
    problems.push(`${slot.key}: only constraint slots carry a check`);
  }

  return problems;
}
