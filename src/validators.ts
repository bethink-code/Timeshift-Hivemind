// The validators: constraints compiled out of the resolved object (face #3, Section 10).
//
// A constraint leaves the prompt and becomes a check that runs after generation
// (Section 6). Compilation is a projection of the one resolved object, never a second
// data model: it reads the resolved constraint keys and binds each to its declarative
// spec. Execution FAILS CLOSED (Section 7): if any fail-closed validator fails, the
// result is a handoff, never a silent ship and never a dead end. The degradation path
// and the safety net are the same mechanism (P8).
//
// Severity is the ENFORCEMENT axis, not the governance lock (ARCHITECTURE.md). Whether a
// failed check forces a handoff is the slot's `enforcement`, decoupled from whether a
// lower scope may override the rule: a delegated rule can still be fail-closed.

import type { Provenance } from "./slot";
import type { ResolvedObject } from "./resolved";
import type { NamedPattern, ValidatorSpec } from "./vocabulary";

/** A resolved constraint, ready to run. `failClosed` (the enforcement axis) is what makes
 *  a failure hand off rather than merely flag — independent of the governance lock. */
export interface CompiledValidator {
  readonly key: string;
  readonly spec: ValidatorSpec;
  readonly failClosed: boolean;
  readonly steer: boolean;
  readonly provenance: Provenance;
}

/** Runtime facts a policy primitive checks against. Anything unknown means the engine
 *  cannot confirm compliance, which fails closed. */
export interface ValidationContext {
  readonly officialLanguage?: string;
  readonly outputLanguage?: string;
  readonly handoffAvailable?: boolean;
}

export interface ValidationFailure {
  readonly key: string;
  readonly reason: string;
  /** A failed fail-closed check forces the handoff; a failed advisory is recorded only. */
  readonly failClosed: boolean;
}

export interface ValidationResult {
  /** "handoff" iff any fail-closed validator failed. Never "blocked-and-shipped". */
  readonly status: "pass" | "handoff";
  readonly failures: readonly ValidationFailure[];
}

/** Platform-owned, bounded patterns. Not data, not tenant-supplied: the only way a
 *  business reaches these is by naming one (NamedPattern), never by writing one. */
const PATTERNS: Record<NamedPattern, RegExp> = {
  email: /[^\s@]+@[^\s@]+\.[^\s@]+/,
  "za-id-number": /\b\d{13}\b/,
  phone: /\b\d{10}\b/,
  url: /https?:\/\/\S+/,
};

/**
 * Compile a resolved agent's constraints into runnable validators.
 *
 * An inactive, advisory constraint (resolved to `false` and not fail-closed) compiles to
 * nothing. Everything else becomes a validator carrying its severity and its steer flag,
 * so the same constraint can be both validated here and reminded in the prompt
 * (the `steer` half of the M1 fix).
 */
export function compileValidators(resolved: ResolvedObject): readonly CompiledValidator[] {
  const compiled: CompiledValidator[] = [];
  for (const k of resolved.keys) {
    if (k.kind !== "constraint" || k.check === undefined) continue;
    const failClosed = k.enforcement !== "advisory";
    if (k.value === false && !failClosed) continue;
    compiled.push({
      key: k.key,
      spec: k.check,
      failClosed,
      steer: k.steer ?? false,
      provenance: k.provenance,
    });
  }
  return Object.freeze(compiled);
}

/** The prompt reminder lines for steer-needed constraints. Phase 3 places these; the
 *  point here is that a `steer: true` constraint appears in BOTH the prompt and the
 *  validator set, never only one (Section 6). */
export function steeringLines(resolved: ResolvedObject): readonly string[] {
  const lines: string[] = [];
  for (const k of resolved.keys) {
    if (k.kind === "constraint" && k.steer === true && k.check !== undefined) {
      lines.push(steerText(k.check));
    }
  }
  return Object.freeze(lines);
}

/** Run every validator against a model output. Pure: no I/O, deterministic. */
export function runValidators(
  validators: readonly CompiledValidator[],
  output: string,
  context: ValidationContext = {},
): ValidationResult {
  const failures: ValidationFailure[] = [];
  for (const v of validators) {
    if (!passes(v.spec, output, context)) {
      failures.push({ key: v.key, reason: describeValidator(v.spec), failClosed: v.failClosed });
    }
  }
  const status = failures.some((f) => f.failClosed) ? "handoff" : "pass";
  return Object.freeze({ status, failures: Object.freeze(failures) });
}

function passes(spec: ValidatorSpec, output: string, ctx: ValidationContext): boolean {
  switch (spec.type) {
    case "forbid-substrings":
      return !spec.any.some((s) => output.includes(s));
    case "require-substring":
      return output.includes(spec.value);
    case "max-length":
      return output.length <= spec.chars;
    case "one-of":
      return spec.options.includes(output.trim());
    case "forbid-pattern":
      return !PATTERNS[spec.pattern].test(output);
    case "reply-in-official-language":
      // Fail closed: an unknown language on either side cannot be confirmed compliant.
      return (
        ctx.officialLanguage !== undefined &&
        ctx.outputLanguage !== undefined &&
        ctx.outputLanguage === ctx.officialLanguage
      );
    case "handoff-available":
      return ctx.handoffAvailable === true;
  }
}

/** A human-readable account of what a validator checks, for the oversight surface. */
export function describeValidator(spec: ValidatorSpec): string {
  switch (spec.type) {
    case "forbid-substrings":
      return `output must not contain: ${spec.any.join(", ")}`;
    case "require-substring":
      return `output must contain: ${spec.value}`;
    case "max-length":
      return `output must be at most ${spec.chars} characters`;
    case "one-of":
      return `output must be one of: ${spec.options.join(", ")}`;
    case "forbid-pattern":
      return `output must not match the ${spec.pattern} pattern`;
    case "reply-in-official-language":
      return "output must be in the user's official language";
    case "handoff-available":
      return "a human-handoff path must be available";
  }
}

function steerText(spec: ValidatorSpec): string {
  switch (spec.type) {
    case "forbid-substrings":
      return `Never use: ${spec.any.join(", ")}.`;
    case "require-substring":
      return `Always include: "${spec.value}".`;
    case "max-length":
      return `Keep replies within ${spec.chars} characters.`;
    case "one-of":
      return `Answer only with one of: ${spec.options.join(", ")}.`;
    case "forbid-pattern":
      return `Never reveal a ${spec.pattern}.`;
    case "reply-in-official-language":
      return "Reply in the user's chosen official language.";
    case "handoff-available":
      return "Offer a human handoff when you reach your limits.";
  }
}
