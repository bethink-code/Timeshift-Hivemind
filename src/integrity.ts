// The tree-integrity validator: the guard on every add (ARCHITECTURE.md).
//
// Adding a skill is not a content scan. On every add it checks the WHOLE tree and rules
// on placement, so the three governing laws hold by construction:
//   - name exists ABOVE you   -> you inherit it; you cannot copy it down (no upward
//     change, one home). REJECTED.
//   - name exists AT your level -> this is an edit to the one copy; it needs that level's
//     authority. ADMISSIBLE (the authority gate lives in the admit flow).
//   - name exists BELOW you     -> you are setting the home above an existing lower copy;
//     admissible, but those lower copies are now duplicates and must be removed.
//   - name exists NOWHERE       -> genuinely new. ADMISSIBLE.
//
// Plus structural hard-checks (path-safe name, size within the layer's bound, a non-empty
// body) and ADVISORY flags (a missing description, prose that smells of prompt injection,
// a global blast radius). Advisory means surfaced for a human, never mechanically blocked:
// prose can be flagged, never certified. It is layer-aware — strictest at User, widest
// blast radius at Engine.
//
// Injection DEFENCES live at their own boundaries, not here (SQL -> parameterised queries,
// path -> the name check below, XSS -> output escaping, prompt -> answer-shapes + human
// review). This validator only flags prose for a human; it never claims to neutralise it.

import type { Scope } from "./slot";
import { SCOPE_ORDER } from "./tree";

/** Where the incoming skill sits relative to where its name already lives in the tree. */
export type IntegrityRelation = "new" | "edit" | "inherit-conflict" | "supersedes-lower";

/** A finding. `code` is stable for callers; `message` is the human account. */
export interface IntegrityNote {
  readonly code: string;
  readonly message: string;
}

export interface IntegrityVerdict {
  readonly name: string;
  readonly scope: Scope;
  readonly relation: IntegrityRelation;
  /** False only when admitting would break tree integrity (an upward duplicate) or a hard
   *  structural rule. Advisory flags never set this false. */
  readonly admissible: boolean;
  /** The scope whose authority the change needs: the target, or — when rejected as an
   *  upward duplicate — the inherited home above. */
  readonly authorityScope: Scope;
  /** inherit-conflict only: where the skill already lives, above you. */
  readonly inheritsFrom?: Scope;
  /** supersedes-lower only: the lower scopes whose now-duplicate copies must be removed. */
  readonly supersedes?: readonly Scope[];
  /** Hard findings — any one blocks (admissible=false). */
  readonly problems: readonly IntegrityNote[];
  /** Advisory findings — surfaced for a human, never blocking. */
  readonly flags: readonly IntegrityNote[];
}

/** The incoming skill, as much as the caller can supply. `description` is the trigger
 *  surface; absent, it is flagged (advisory), since legacy onboarding often lacks it. */
export interface IncomingForCheck {
  readonly name: string;
  readonly scope: Scope;
  readonly body: string;
  readonly description?: string;
}

/** One placement of a name in the tree: the name and the scope that holds it. The caller
 *  passes the placements on the incoming skill's own lineage, never a sibling subtree's. */
export interface ExistingPlacement {
  readonly name: string;
  readonly scope: Scope;
}

interface LayerPolicy {
  /** The governance layer name an owner recognises (ARCHITECTURE.md). */
  readonly label: string;
  /** The body-size ceiling for this layer. Tightest at User, widest at Engine. */
  readonly maxBodyBytes: number;
}

/** Layer-aware policy: strictness rises as authority falls. A User-layer skill is kept
 *  small (a thin personal override); an Engine-layer skill may carry broad shared craft. */
export const LAYER_POLICY: Record<Scope, LayerPolicy> = {
  timeshift: { label: "Engine", maxBodyBytes: 100_000 },
  region: { label: "Region", maxBodyBytes: 100_000 },
  tenant: { label: "Tenant", maxBodyBytes: 50_000 },
  agent: { label: "User", maxBodyBytes: 10_000 },
};

const MAX_NAME_LENGTH = 64;

/** Path-safe, folder-matchable, lower-kebab. No separators, no traversal, no spaces, so a
 *  name can never escape its directory or collide by case. The path-traversal defence. */
const PATH_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPathSafeName(name: string): boolean {
  return PATH_SAFE.test(name);
}

/** Curated prompt-injection markers. Each match is an ADVISORY flag for a human, never a
 *  block: prose is never mechanically certified safe. Kept deliberately small and obvious. */
const INJECTION_MARKERS: readonly { readonly code: string; readonly re: RegExp; readonly message: string }[] = [
  {
    code: "override-instruction",
    re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your)\b/i,
    message: "body reads like an instruction-override attempt — review before admitting",
  },
  {
    code: "role-reassignment",
    re: /\b(you are now|act as|pretend to be|from now on)\b[^.\n]{0,40}\b(admin|root|developer|system|unrestricted|dan)\b/i,
    message: "body tries to reassign the assistant's role — review before admitting",
  },
  {
    code: "system-prompt-probe",
    re: /\b(system prompt|developer message|reveal your (instructions|prompt|rules)|print your (instructions|prompt))\b/i,
    message: "body probes for the system prompt — review before admitting",
  },
  {
    code: "data-exfiltration",
    re: /\b(exfiltrat|leak|send (it|them|this|the data) to|post .* to https?:\/\/)\b/i,
    message: "body mentions exfiltrating data — review before admitting",
  },
];

const byteLength = (s: string): number => new TextEncoder().encode(s).length;
const idx = (s: Scope): number => SCOPE_ORDER.indexOf(s);

/**
 * Rule on whether an incoming skill may be admitted at its scope, given where its name
 * already lives on the same lineage. Pure and deterministic; it changes nothing and reads
 * no I/O. The admit flow turns an admissible verdict into a human-confirmed application.
 */
export function checkSkillAddition(
  incoming: IncomingForCheck,
  existing: readonly ExistingPlacement[],
): IntegrityVerdict {
  const problems: IntegrityNote[] = [];
  const flags: IntegrityNote[] = [];

  // ---- structural hard-checks ----
  if (!isPathSafeName(incoming.name)) {
    problems.push({ code: "name-not-path-safe", message: `"${incoming.name}" is not a path-safe name (lower-case kebab, no separators)` });
  }
  if (incoming.name.length > MAX_NAME_LENGTH) {
    problems.push({ code: "name-too-long", message: `name exceeds ${MAX_NAME_LENGTH} characters` });
  }
  if (incoming.body.trim() === "") {
    problems.push({ code: "empty-body", message: "a skill needs a body" });
  }
  const policy = LAYER_POLICY[incoming.scope];
  const bytes = byteLength(incoming.body);
  if (bytes > policy.maxBodyBytes) {
    problems.push({ code: "body-too-large", message: `body is ${bytes} bytes, over the ${policy.label} layer limit of ${policy.maxBodyBytes}` });
  }

  // ---- advisory: frontmatter completeness ----
  if ((incoming.description ?? "").trim() === "") {
    flags.push({ code: "missing-description", message: "no description — the router needs one as the trigger surface; add it before this skill can be selected" });
  }

  // ---- advisory: prompt-injection smell on the prose ----
  for (const m of INJECTION_MARKERS) {
    if (m.re.test(incoming.body)) flags.push({ code: m.code, message: m.message });
  }

  // ---- the tree relation ----
  const placements = existing.filter((e) => e.name === incoming.name);
  const ti = idx(incoming.scope);
  const above = placements.filter((e) => idx(e.scope) < ti).map((e) => e.scope);
  const below = placements.filter((e) => idx(e.scope) > ti).map((e) => e.scope);
  const sameLevel = placements.some((e) => e.scope === incoming.scope);

  let relation: IntegrityRelation;
  let authorityScope: Scope = incoming.scope;
  let inheritsFrom: Scope | undefined;
  let supersedes: Scope[] | undefined;

  if (above.length > 0) {
    relation = "inherit-conflict";
    inheritsFrom = above.sort((a, b) => idx(a) - idx(b))[0]; // the broadest holder above
    authorityScope = inheritsFrom!;
    problems.push({
      code: "upward-duplicate",
      message: `"${incoming.name}" already lives at the ${LAYER_POLICY[inheritsFrom!].label} layer above you; inherit it, do not copy it down (no upward change, one home)`,
    });
  } else if (sameLevel) {
    relation = "edit";
  } else if (below.length > 0) {
    relation = "supersedes-lower";
    supersedes = below.sort((a, b) => idx(a) - idx(b));
    flags.push({
      code: "supersedes-lower",
      message: `setting the home here supersedes the lower cop${below.length > 1 ? "ies" : "y"} at ${supersedes.map((s) => LAYER_POLICY[s].label).join(", ")}; ${below.length > 1 ? "they" : "it"} must be removed to keep one home`,
    });
  } else {
    relation = "new";
  }

  // ---- layer-aware advisory: blast radius at the top ----
  if ((relation === "new" || relation === "edit") && incoming.scope === "timeshift") {
    flags.push({ code: "global-blast-radius", message: "this is an Engine-layer change; it reaches every tenant and agent" });
  }

  const admissible = problems.length === 0;
  return {
    name: incoming.name,
    scope: incoming.scope,
    relation,
    admissible,
    authorityScope,
    ...(inheritsFrom ? { inheritsFrom } : {}),
    ...(supersedes ? { supersedes: Object.freeze(supersedes) } : {}),
    problems: Object.freeze(problems),
    flags: Object.freeze(flags),
  };
}
