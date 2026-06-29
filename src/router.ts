// The router: per-task relevance selection (ARCHITECTURE.md §router, engine spec §6).
//
// Of the governed, resolved, tenant-scoped skill set, which few does THIS task need? The
// router answers from each skill's tiny trigger surface (name + description) alone — it
// never reads a body, so bodies stay lazy and load only for the chosen few. It only ever
// sees the set it is handed, so routing happens inside the fence: never another tenant's
// skills, never something the top has not delegated.
//
// MODEL-INDEPENDENT (P1). The canonical router here is DETERMINISTIC — plain trigger
// matching, no model, no network — because a sovereign deployment may run a model with no
// skill-routing of its own. A model- or embedding-backed router is a swappable adapter:
// implement the `Router` interface and pass it instead. On Claude we MAY also delegate to
// Claude's native skill-routing as an optimisation, but that is never the only path.
//
// It also carries the WHY: each selection records the terms that matched, so "why was this
// skill loaded for this task?" is answerable on the oversight surface, not a black box.

import type { SkillSurface } from "./skill";

export interface RouteRequest {
  /** The task in the requester's own words: the primary signal. */
  readonly query: string;
  /** Skills to include regardless of the query (an always-on or just-confirmed skill).
   *  Pinned skills are matched too, so their `why` is still recorded. */
  readonly pinned?: readonly string[];
  /** Cap on how many skills to select. Pinned skills are always kept; the cap bounds the
   *  query-matched ones. Undefined means no cap. */
  readonly limit?: number;
}

export interface RoutedSkill {
  readonly name: string;
  readonly description: string;
  /** Higher means a stronger trigger match. A name hit weighs more than a description hit. */
  readonly score: number;
  /** The query terms that matched this skill's surface — the explainable "why". */
  readonly matched: readonly string[];
  /** Why it was selected: a query match, or a caller pin. */
  readonly reason: "matched" | "pinned";
}

export interface RouteResult {
  /** The chosen skills, in deterministic order: pinned first (by name), then matched by
   *  descending score, ties broken by name. Load only these bodies. */
  readonly selected: readonly RoutedSkill[];
  /** How many surfaces were considered, so the readout shows what was filtered out. */
  readonly considered: number;
}

/** The routing contract. The deterministic router below is the default; a model- or
 *  embedding-backed router is any other implementation of this one method. */
export interface Router {
  route(surfaces: readonly SkillSurface[], request: RouteRequest): RouteResult;
}

/** Words too common to be a useful trigger. Small and deliberate; the point is to drop
 *  noise, not to do real NLP (that would be a model's job, behind the Router interface). */
const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "this", "that", "have", "has", "are", "was", "will",
  "you", "your", "our", "can", "should", "would", "into", "from", "about", "what",
  "how", "why", "when", "use", "using", "need", "want", "make", "made", "get", "got",
]);

/** Normalise text to comparable trigger terms: lower-case, split on non-alphanumerics,
 *  drop very short tokens and stopwords. Deterministic and pure. */
function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const NAME_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;

/** Score one surface against the query terms. A term in the name weighs more than one only
 *  in the description; each matched term is counted once, at its strongest position. */
function scoreSurface(surface: SkillSurface, queryTerms: readonly string[]): { score: number; matched: string[] } {
  const nameTerms = new Set(terms(surface.name));
  const descTerms = new Set(terms(surface.description));
  let score = 0;
  const matched: string[] = [];
  for (const term of queryTerms) {
    if (nameTerms.has(term)) {
      score += NAME_WEIGHT;
      matched.push(term);
    } else if (descTerms.has(term)) {
      score += DESCRIPTION_WEIGHT;
      matched.push(term);
    }
  }
  return { score, matched };
}

function byNameAsc(a: { name: string }, b: { name: string }): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The deterministic, model-free router. Same surfaces and request always give the same
 * selection in the same order (L6 in spirit), so a routing decision is reproducible and
 * therefore auditable.
 */
export function route(surfaces: readonly SkillSurface[], request: RouteRequest): RouteResult {
  const pinnedSet = new Set(request.pinned ?? []);
  const queryTerms = [...new Set(terms(request.query))];

  const pinned: RoutedSkill[] = [];
  const matched: RoutedSkill[] = [];
  for (const surface of surfaces) {
    const { score, matched: m } = scoreSurface(surface, queryTerms);
    if (pinnedSet.has(surface.name)) {
      pinned.push({ name: surface.name, description: surface.description, score, matched: m, reason: "pinned" });
    } else if (score > 0) {
      matched.push({ name: surface.name, description: surface.description, score, matched: m, reason: "matched" });
    }
  }

  pinned.sort(byNameAsc);
  matched.sort((a, b) => b.score - a.score || byNameAsc(a, b));

  const room = request.limit === undefined ? matched.length : Math.max(0, request.limit - pinned.length);
  const selected = [...pinned, ...matched.slice(0, room)];
  return { selected: Object.freeze(selected), considered: surfaces.length };
}

/** The default router as a swappable object, so callers can hold a `Router` and drop in a
 *  model-backed one later without changing their wiring. */
export const deterministicRouter: Router = { route };

/** The chosen skill names, ready to hand to renderPrompt's `selected` so only these bodies
 *  load. The router decides the set; the renderer loads it. */
export function routedNames(result: RouteResult): string[] {
  return result.selected.map((s) => s.name);
}
