// The prompt: rendered from the resolved object (face #2, Section 10).
//
// Only `fill` keys become prompt text, deterministically positioned (L6). Constraints
// have already left the prompt (Section 6); the only ones that come back are the
// steer-needed ones, as a thin guardrails block. Skills are loaded lazily: every
// inherited skill's trigger surface is available, but only the bodies the task selects
// are placed in the prompt. The model never performs precedence reasoning, because the
// resolver already adjudicated every key (L4); the prompt reads as one author's voice.

import type { ResolvedKey, ResolvedObject } from "./resolved";
import type { Register, SlotValue } from "./slot";
import { steeringLines } from "./validators";
import { surfacesOf, type Skill, type SkillSurface } from "./skill";

export interface RenderedSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export interface RenderedPrompt {
  readonly text: string;
  readonly sections: readonly RenderedSection[];
  /** Eager: every inherited skill's tiny trigger surface (Section 6). */
  readonly availableSkills: readonly SkillSurface[];
  /** Lazy: the names whose bodies were actually placed in the prompt. */
  readonly loadedSkills: readonly string[];
}

export interface RenderOptions {
  /** The agent's inherited skills (see inheritSkills); their surfaces are always
   *  available, their bodies loaded only when selected. */
  readonly skills?: readonly Skill[];
  /** The skill names the current task selected. Only these bodies are rendered. */
  readonly selected?: readonly string[];
}

function fmt(value: SlotValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function fills(keys: readonly ResolvedKey[], register: Register): string[] {
  return keys
    .filter((k) => k.kind === "fill" && k.register === register)
    .map((k) => `- ${k.key}: ${fmt(k.value)}`);
}

/**
 * Render an agent's resolved object (and its task-selected skills) into a prompt.
 *
 * Deterministic by construction: sections are in a fixed order, and within each the
 * keys are already key-sorted by the resolver, so the same inputs always produce the
 * same text in the same positions. Empty sections are dropped so the prompt stays
 * tight, which is the same input producing the same omission.
 */
export function renderPrompt(resolved: ResolvedObject, options: RenderOptions = {}): RenderedPrompt {
  const inherited = options.skills ?? [];
  const selected = new Set(options.selected ?? []);
  const loaded = inherited.filter((s) => selected.has(s.name));

  const sections: RenderedSection[] = [
    { title: "Identity", lines: fills(resolved.keys, "personality") },
    { title: "Behaviour", lines: fills(resolved.keys, "engine") },
    { title: "Compliance", lines: fills(resolved.keys, "compliance") },
    { title: "Guardrails", lines: steeringLines(resolved).map((line) => `- ${line}`) },
    { title: "Skills", lines: loaded.map((s) => s.body) },
  ].filter((s) => s.lines.length > 0);

  const text = sections.map((s) => `# ${s.title}\n${s.lines.join("\n")}`).join("\n\n");

  return {
    text,
    sections: Object.freeze(sections),
    availableSkills: surfacesOf(inherited),
    loadedSkills: Object.freeze(loaded.map((s) => s.name)),
  };
}
