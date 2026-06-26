// The wizards: slots projected for the filler (face #5, Section 11).
//
// A wizard is not a new artifact. It is the slot interview rendered, filtered by the
// scope and register the filler is allowed to author. New slots mean a new wizard
// automatically, with no founder in the loop (P4). There is one wizard per authorship
// origin, each surfacing only that scope's register:
//   - tenant-setup: the tenant's how-it-works (engine slots at tenant scope)
//   - agent:        the staff member's who-it-is (personality slots at agent scope)
//   - compliance:   the business self-declaring (compliance slots at region scope)
//
// The template-authoring surface is deliberately NOT here: it is the craft surface
// where slots are cut, the one thing not automated away (Section 11). Its feedback
// channel is lint() in the resolver.

import type { AnswerShape, Register, Scope, SlotValue } from "./slot";
import type { SlotTree } from "./tree";

export type WizardAudience = "tenant-setup" | "agent" | "compliance";

export interface WizardQuestion {
  readonly key: string;
  readonly question: string;
  /** The constrained set of valid answers. This, not the question, is the security
   *  control: free text is the vulnerability (Section 7). */
  readonly answerShape: AnswerShape;
  readonly required: boolean;
}

interface WizardSpec {
  readonly scope: Scope;
  readonly register: Register;
  /** The authority every answer from this wizard is stamped with (Section 11). */
  readonly authority: string;
}

const WIZARDS: Record<WizardAudience, WizardSpec> = {
  "tenant-setup": { scope: "tenant", register: "engine", authority: "tenant-author" },
  agent: { scope: "agent", register: "personality", authority: "agent-owner" },
  compliance: { scope: "region", register: "compliance", authority: "business-self-declared" },
};

/**
 * Build a wizard by projecting the interviewed slots a given filler may author.
 *
 * The filter is both scope and register, so the agent wizard cannot render a
 * how-it-works question even in principle: no behaviour-bearing slot is ever pointed
 * at the agent scope (L9), and the register filter is the belt to that braces.
 * Platform-authored slots (interview === null) are never surfaced.
 */
export function buildWizard(tree: SlotTree, audience: WizardAudience): readonly WizardQuestion[] {
  const spec = WIZARDS[audience];
  const questions: WizardQuestion[] = [];
  for (const slot of tree.slots[spec.scope]) {
    if (slot.register !== spec.register || slot.interview === null) continue;
    questions.push({
      key: slot.key,
      question: slot.interview.question,
      answerShape: slot.interview.answerShape,
      required: slot.interview.required,
    });
  }
  return Object.freeze(questions);
}

/** The provenance authority answers from this wizard are recorded under. The compliance
 *  wizard's "business-self-declared" is what the audit trail later defends (Section 7). */
export function wizardAuthority(audience: WizardAudience): string {
  return WIZARDS[audience].authority;
}

/**
 * Validate one answer against its slot's answer-shape, the boundary control that stops
 * a careless or compromised account writing behaviour into a value field (Section 7).
 * Returns null when the answer is acceptable, or a reason when it is not.
 */
export function validateAnswer(shape: AnswerShape, value: SlotValue): string | null {
  switch (shape.type) {
    case "enum":
      return typeof value === "string" && shape.options.includes(value)
        ? null
        : `must be one of: ${shape.options.join(", ")}`;
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "shortText": {
      if (typeof value !== "string") return "must be text";
      if (value.length > shape.maxLength) return `must be at most ${shape.maxLength} characters`;
      // pattern, when present, is platform-authored at template time, not filler-supplied
      if (shape.pattern !== undefined && !new RegExp(shape.pattern).test(value)) {
        return `must match the required format`;
      }
      return null;
    }
  }
}
