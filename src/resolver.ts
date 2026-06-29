// The resolver: the heart of the engine (Section 4).
//
// A pure, deterministic function over an already-tenant-scoped tree. No I/O, no
// clock, no framework, no model. It walks the scopes and applies the laws:
//   L1 per key   L2 TOP-DOWN, DENY-BY-DEFAULT   L3 a lock denies lower scopes
//   L4 resolve then render (losers leave the output)   L5 match keys, not prose
//   L6 deterministic (same input, same output, same order)
//   L7/L8/L9 runtime halves: compliance stays locked, lists merge by their owner's
//            rule with element-level locks, no key is split across registers.
//
// L2/L3 are the governance inversion (ARCHITECTURE.md, Law 1): the highest scope that
// holds a key wins and, unless it is "open", locks every lower scope out. The top rules;
// a lower scope overrides only what a higher one delegated. This replaces the spec's
// original most-specific-wins. Governance (who may override) is kept separate from
// enforcement (whether a failed check is fatal) — see slot.ts.
//
// The bar here is not "composes correctly" but "cannot be made to compose wrongly"
// (Section 7). So the resolver validates the whole tree first and FAILS CLOSED: a
// malformed tree throws rather than yielding a half-right prompt.

import {
  behaviourOf,
  enforcementOf,
  slotInvariants,
  type Merge,
  type Scope,
  type Slot,
  type SlotValue,
} from "./slot";
import type { ResolvedKey, ResolvedObject, ResolutionStep } from "./resolved";
import { SCOPE_ORDER, type SlotTree } from "./tree";

/** Thrown when a tree cannot be composed safely. Carries every problem found, so the
 *  oversight surface and the author both see the full account, not just the first. */
export class ResolutionError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`resolution refused: ${problems.join("; ")}`);
    this.name = "ResolutionError";
    this.problems = problems;
  }
}

interface ScopedSlot {
  readonly scope: Scope;
  readonly slot: Slot;
}

/** The slot's effective value. Today that is its authored value, carried as
 *  defaultValue; when the wizards land (Phase 5) a collected answer layers in here
 *  without changing a single resolution law. */
function slotValue(slot: Slot): SlotValue {
  return slot.defaultValue;
}

function mergeOf(slot: Slot): Merge | undefined {
  return "merge" in slot ? slot.merge : undefined;
}

/** Build a resolved key from its winner, threading the constraint metadata the
 *  validator face needs (kind, check, steer) without inventing a second data model. */
function finishKey(
  key: string,
  value: SlotValue,
  winningScope: Scope,
  locked: boolean,
  slot: Slot,
  steps: readonly ResolutionStep[],
): ResolvedKey {
  const base: ResolvedKey = {
    key,
    value,
    winningScope,
    locked,
    provenance: slot.provenance,
    trail: Object.freeze([...steps]),
    kind: slot.kind,
    register: slot.register,
  };
  if (slot.kind === "constraint" && "check" in slot && slot.check !== undefined) {
    return {
      ...base,
      check: slot.check,
      steer: ("steer" in slot ? slot.steer : undefined) ?? false,
      enforcement: enforcementOf(slot),
    };
  }
  return base;
}

/** Group slots by key, preserving cascade order (scope order, then authoring order
 *  within a scope). The map's per-key arrays are therefore broadest-to-narrowest. */
function collectByKey(tree: SlotTree): Map<string, ScopedSlot[]> {
  const byKey = new Map<string, ScopedSlot[]>();
  for (const scope of SCOPE_ORDER) {
    for (const slot of tree.slots[scope]) {
      const list = byKey.get(slot.key) ?? [];
      list.push({ scope, slot });
      byKey.set(slot.key, list);
    }
  }
  return byKey;
}

/** Every way a tree can be malformed, collected. Empty means safe to resolve. */
function validateTree(tree: SlotTree, byKey: Map<string, ScopedSlot[]>): string[] {
  const problems: string[] = [];

  for (const scope of SCOPE_ORDER) {
    const seen = new Set<string>();
    for (const slot of tree.slots[scope]) {
      problems.push(...slotInvariants(slot));
      if (slot.scope !== scope) {
        problems.push(`${slot.key}: slot.scope "${slot.scope}" does not match its tree position "${scope}"`);
      }
      if (seen.has(slot.key)) {
        problems.push(`${slot.key}: declared more than once at scope "${scope}"`);
      }
      seen.add(slot.key);
    }
  }

  for (const [key, entries] of byKey) {
    // L5 / Section 7: a key has exactly one register. A personality slot squatting an
    // engine key would be a privilege-escalation route; it is rejected here, not
    // merely out-cascaded.
    const registers = new Set(entries.map((e) => e.slot.register));
    if (registers.size > 1) {
      problems.push(`${key}: authored under more than one register (${[...registers].join(", ")}); a key has one register (L5)`);
    }

    // L8: merge is owned by the key, so all scopes that speak must agree, and an
    // append key must carry a list at every scope.
    const merges = new Set(
      entries.map((e) => mergeOf(e.slot)).filter((m): m is Merge => m !== undefined),
    );
    if (merges.size > 1) {
      problems.push(`${key}: conflicting merge behaviours (${[...merges].join(", ")}); merge is owned by the key (L8)`);
    }
    if (merges.has("append")) {
      for (const { scope, slot } of entries) {
        if (!Array.isArray(slotValue(slot))) {
          problems.push(`${key}: append key has a non-list value at scope "${scope}" (L8)`);
        }
      }
    }
  }

  return problems;
}

/** Every way a tree is malformed, collected without throwing. The template-authoring
 *  surface (Section 11) reads this to show problems live as slots are cut; resolve()
 *  throws on exactly the same set. Empty means safe to resolve. */
export function lint(tree: SlotTree): readonly string[] {
  return Object.freeze(validateTree(tree, collectByKey(tree)));
}

/** Replace-mode resolution (scalars, and lists whose owner chose `replace`), TOP-DOWN and
 *  DENY-BY-DEFAULT (L2/L3, Law 1). `entries` are broadest-to-narrowest; the first holder
 *  wins. A "locked" winner (the default) freezes every lower scope out — each is recorded
 *  as blocked, never silently dropped (Section 9). An "open" winner delegates: the next
 *  narrower scope may override it, and so on down the open chain until a lock or the end. */
function resolveReplace(key: string, entries: readonly ScopedSlot[]): ResolvedKey {
  const steps: ResolutionStep[] = [];
  let winner: ScopedSlot | undefined;
  let winnerIdx = -1;
  let locked = false;

  for (const { scope, slot } of entries) {
    const value = slotValue(slot);
    const behaviour = behaviourOf(slot);
    if (locked) {
      steps.push({ scope, value, behaviour, outcome: "blocked-by-lock" });
      continue;
    }
    const prev = winnerIdx >= 0 ? steps[winnerIdx] : undefined;
    if (prev) steps[winnerIdx] = { ...prev, outcome: "overridden" };
    steps.push({ scope, value, behaviour, outcome: "won" });
    winnerIdx = steps.length - 1;
    winner = { scope, slot };
    if (behaviour === "locked") locked = true;
  }

  if (!winner) throw new ResolutionError([`${key}: resolved to no winner`]);
  return finishKey(key, slotValue(winner.slot), winner.scope, locked, winner.slot, steps);
}

/** Append-mode resolution (L8). Every scope that speaks contributes its elements in
 *  cascade order; duplicates keep their first (broadest) position, so a narrower scope
 *  can only add, never reorder or shadow a higher element. That add-only shape is itself
 *  the deny-by-default rule for lists: a locked contributor (the default) marks the list
 *  established, so a lower scope's sandbox is "extend", never "rewrite". */
function resolveAppend(key: string, entries: readonly ScopedSlot[]): ResolvedKey {
  const elements: string[] = [];
  const steps: ResolutionStep[] = [];
  let last: ScopedSlot | undefined;
  let locked = false;

  for (const { scope, slot } of entries) {
    const value = slotValue(slot);
    const behaviour = behaviourOf(slot);
    const list = Array.isArray(value) ? value : [];
    for (const el of list) if (!elements.includes(el)) elements.push(el);
    if (behaviour === "locked") locked = true;
    steps.push({ scope, value, behaviour, outcome: "won" });
    last = { scope, slot };
  }

  if (!last) throw new ResolutionError([`${key}: resolved to no contributor`]);
  return finishKey(key, Object.freeze(elements.slice()), last.scope, locked, last.slot, steps);
}

function resolveKey(key: string, entries: readonly ScopedSlot[]): ResolvedKey {
  const append = entries.some((e) => mergeOf(e.slot) === "append");
  return append ? resolveAppend(key, entries) : resolveReplace(key, entries);
}

/**
 * Resolve one agent's tree to its effective rule set.
 *
 * Deterministic (L6): keys are emitted in a stable sorted order, and every array in
 * the output is frozen, so the same tree always produces the same bytes in the same
 * positions. That reproducibility is what makes the attestation trustworthy, and no
 * more than that: it proves which rules were composed, never that the model obeyed
 * them (Section 7).
 */
export function resolve(tree: SlotTree): ResolvedObject {
  const byKey = collectByKey(tree);
  const problems = validateTree(tree, byKey);
  if (problems.length > 0) throw new ResolutionError(problems);

  const keys = [...byKey.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const resolved = keys.map(([key, entries]) => resolveKey(key, entries));

  return {
    tenantId: tree.tenantId,
    agentId: tree.agentId,
    scopeVersions: tree.versions,
    keys: Object.freeze(resolved),
  };
}
