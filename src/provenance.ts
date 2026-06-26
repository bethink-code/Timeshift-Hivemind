// The provenance / event log: the visibility substrate (Section 9).
//
// "The engine may not do anything it cannot show." Every resolution, override,
// locked mandate, validator pass or fail, wizard answer, and version bump emits a
// structured record as it happens. The log exists from the first write (#7), and it
// is append-only from the first write (#5): the type below exposes no path to update
// or delete an entry. Tamper-evidence and external storage are deferred (Section 12);
// the append-only shape is not.

import type { Provenance } from "./slot";

/** The kinds of thing the engine emits. Nothing is silent (Section 9). */
export type EngineEventType =
  | "slot.authored"
  | "slot.answered"
  | "resolution.performed"
  | "mandate.stopped-cascade"
  | "validator.failed"
  | "version.bumped"
  | "tenant.onboarded";

export interface EngineEvent {
  /** Assigned by the log on append; monotonic, gap-free. */
  readonly seq: number;
  readonly type: EngineEventType;
  /** Every event is tenant-scoped (#1); the substrate never crosses tenants. */
  readonly tenantId: string;
  /** Caller-supplied ISO timestamp. The log owns ordering via `seq`, not the clock. */
  readonly at: string;
  readonly detail: Readonly<Record<string, unknown>>;
  readonly provenance?: Provenance;
}

/**
 * Append-only from the first write (#5, Section 7).
 *
 * The class holds its entries privately and offers exactly two operations: append
 * one event, and read a frozen snapshot. There is deliberately no update, no delete,
 * no splice, and no handle to the backing array. Self-declared compliance is only
 * defensible if the business cannot rewrite the record of what it declared and when;
 * that property starts here, in the shape, before any storage engine is chosen.
 */
export class AppendOnlyLog {
  #entries: EngineEvent[] = [];

  /** Record one event. Returns the stamped, frozen entry that was stored. */
  append(event: Omit<EngineEvent, "seq">): EngineEvent {
    const stamped: EngineEvent = Object.freeze({ ...event, seq: this.#entries.length });
    this.#entries.push(stamped);
    return stamped;
  }

  /** A frozen snapshot of every entry. Callers cannot reach the log through it. */
  entries(): readonly EngineEvent[] {
    return Object.freeze(this.#entries.slice());
  }

  /** A frozen, tenant-scoped snapshot. The oversight surface reads through this so
   *  one tenant's account is never projected for another. */
  entriesForTenant(tenantId: string): readonly EngineEvent[] {
    return Object.freeze(this.#entries.filter((e) => e.tenantId === tenantId));
  }

  get size(): number {
    return this.#entries.length;
  }
}
