// TimeShift engine core — the substrate (Phase 0).
//
// Pure, dependency-free. Honours P1 (sovereign-deployable) and P2 (universal engine):
// nothing here binds a model, a framework, a database, or a vertical. The resolver
// (Phase 1) and the validators (Phase 2) build on these shapes.

export type {
  Register,
  Scope,
  Kind,
  ResolutionBehaviour,
  Merge,
  SlotValue,
  Provenance,
  AnswerShape,
  Interview,
  EngineSlot,
  ComplianceSlot,
  PersonalitySlot,
  Slot,
} from "./slot";
export { slotInvariants } from "./slot";

export type { EngineEventType, EngineEvent } from "./provenance";
export { AppendOnlyLog } from "./provenance";

export type { ResolutionStep, ResolvedKey, ResolvedObject } from "./resolved";

export type { SlotTree } from "./tree";
export { SCOPE_ORDER } from "./tree";

export { resolve, lint, ResolutionError } from "./resolver";

export type { NamedPattern, ValidatorSpec } from "./vocabulary";
export type {
  CompiledValidator,
  ValidationContext,
  ValidationFailure,
  ValidationResult,
} from "./validators";
export { compileValidators, runValidators, steeringLines, describeValidator } from "./validators";

export type { Skill, SkillSurface, SkillsByScope, SkillOutcome, SkillStep, ResolvedSkill } from "./skill";
export { inheritSkills, resolveSkills, surfacesOf } from "./skill";

export type { RenderedPrompt, RenderedSection, RenderOptions } from "./render";
export { renderPrompt } from "./render";

export type {
  KeyExplanation,
  ValidatorWatch,
  AgentExplanation,
  ExplainOptions,
  Overview,
} from "./oversight";
export { explainAgent, recordResolution, overview } from "./oversight";

export type { WizardAudience, WizardQuestion } from "./wizard";
export { buildWizard, wizardAuthority, validateAnswer } from "./wizard";
