// The durable audit sink: the one append-only log on disk (P2/P3).
//
// AppendOnlyLog (src/provenance.ts) is the in-memory shape; this is its filesystem edge.
// Events are stored as JSON Lines — one event per line — because JSONL is append-only by
// construction: a new event is a new line, and existing lines are never rewritten. (The
// old per-tool audit re-serialised a whole JSON array on every write, which is not the
// same promise.) The DB-backed engine_events table is the deferred production sink; this
// keeps the same EngineEvent shape so the move is a swap, not a rewrite.
//
// I/O lives here, outside the pure engine (P1). Reading the whole file to continue the
// seq is fine at the scale of an audit; if it ever isn't, the line count can be cached.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EngineEvent } from "../src/index";

export class FileAuditLog {
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  /** Append events as JSONL, stamping each with a seq that continues from the file, so the
   *  monotonic, gap-free ordering of AppendOnlyLog holds across processes too. Returns the
   *  stamped events. Never rewrites an existing line. */
  append(events: readonly Omit<EngineEvent, "seq">[]): EngineEvent[] {
    if (events.length === 0) return [];
    const base = this.read().length;
    const stamped = events.map((e, i) => ({ ...e, seq: base + i }));
    mkdirSync(dirname(this.#path), { recursive: true });
    appendFileSync(this.#path, stamped.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    return stamped;
  }

  /** Every event recorded, in order. An absent file reads as an empty log. */
  read(): EngineEvent[] {
    if (!existsSync(this.#path)) return [];
    return readFileSync(this.#path, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as EngineEvent);
  }
}
