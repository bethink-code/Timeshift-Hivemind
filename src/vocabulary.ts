// The closed validator vocabulary (#3, Section 7).
//
// "The wizard that lets a business self-declare compliance must emit validators from a
// constrained vocabulary the platform controls (enums, patterns, policy primitives),
// never arbitrary code or unbounded regex." This file IS that vocabulary, and its
// closedness is structural: ValidatorSpec is a fixed discriminated union with no
// "custom function" or "raw regex string" member. The worst a business can author is
// a valid-but-wrong rule, never a dangerous one. Adding a primitive is a deliberate
// platform act (a new union member here), not something a tenant can do at runtime.

/** A pattern from the platform-controlled registry. A business may reference one by
 *  name but may never author a raw regex: the worst it can pick is the wrong named
 *  pattern. The patterns themselves live in the engine (validators.ts), not in data. */
export type NamedPattern = "email" | "za-id-number" | "phone" | "url";

/** Every validator the engine can compile. A constraint slot carries exactly one. */
export type ValidatorSpec =
  // text checks, parameters drawn from constrained answer-shapes
  | { readonly type: "forbid-substrings"; readonly any: readonly string[] }
  | { readonly type: "require-substring"; readonly value: string }
  | { readonly type: "max-length"; readonly chars: number }
  | { readonly type: "one-of"; readonly options: readonly string[] }
  // pattern check, the pattern named from the registry, never supplied as a regex
  | { readonly type: "forbid-pattern"; readonly pattern: NamedPattern }
  // policy primitives, verified against runtime context rather than output text
  | { readonly type: "reply-in-official-language" }
  | { readonly type: "handoff-available" };
