// Admit: the one reusable operation for bringing a skill into the hive (steps 4-5 of
// ESTATE-ONBOARDING.md). Onboarding is this run in bulk; adding a skill later is this
// run once. Same path, parameterised by scope and by who must confirm.
//
// Human in the loop, always. propose() only describes and recommends; it never changes
// anything. applyDecisions() acts ONLY on items a human ticked, and ONLY when the
// person who ticked holds the authority that scope requires. Everything it does is
// recorded. Nothing moves without a confirmed decision from the right human.

import { classifyVariants, type DriftVerdict } from "./scan";
import {
  canConfirm,
  checkSkillAddition,
  LAYER_POLICY,
  requirementFor,
  SCOPE_ORDER,
  type AuthorityDecision,
  type IntegrityVerdict,
  type Principal,
  type Role,
} from "../src/index";

export type AdmitScope = "timeshift" | "tenant" | "agent";

/** Whether an existing skill sits on the incoming skill's own lineage (ancestor, same
 *  node, or descendant) — never a sibling subtree's. timeshift is everyone's ancestor;
 *  tenant and agent placements belong to one project's vertical path only. This is what
 *  keeps a name in project A from colliding with the same name in project B. */
function inLineage(e: ExistingSkill, incoming: { name: string; scope: AdmitScope; project?: string }): boolean {
  if (e.name !== incoming.name) return false;
  const ei = SCOPE_ORDER.indexOf(e.scope);
  const ti = SCOPE_ORDER.indexOf(incoming.scope);
  const isGlobal = (s: AdmitScope): boolean => s === "timeshift";
  if (ei < ti) return isGlobal(e.scope) || e.project === incoming.project; // ancestor
  if (ei === ti) return e.project === incoming.project; // same node
  return isGlobal(incoming.scope) || e.project === incoming.project; // descendant
}

export interface IncomingSkill {
  readonly name: string;
  readonly content: string;
  readonly scope: AdmitScope;
  readonly project?: string;
}

export interface ExistingSkill {
  readonly name: string;
  readonly content: string;
  readonly scope: AdmitScope;
  readonly project?: string;
}

export type AdmitStatus = "new" | "identical" | "diverged" | "inherit";

export interface AdmitProposal {
  readonly name: string;
  readonly scope: AdmitScope;
  readonly project?: string;
  readonly status: AdmitStatus;
  readonly recommendation: string;
  readonly verdict?: DriftVerdict;
  readonly requiredConfirmer: string;
  /** The tree-integrity verdict. A non-admissible proposal cannot be applied even if a
   *  human ticks it: the guard is the last line, the human gate the second. */
  readonly integrity: IntegrityVerdict;
}

/** The role that must say yes to admit a skill at this scope, for display on the proposal.
 *  Sourced from the authority module so the rule lives in exactly one place. An agent-scope
 *  addition is behaviour a staff member cannot wave through themselves (L9), so it requires
 *  the tenant admin: the engine routes the confirmation up rather than deciding for anyone. */
export function requiredConfirmer(scope: AdmitScope): Role {
  return requirementFor(scope).role;
}

function sameSlot(a: { name: string; scope: AdmitScope; project?: string }, b: { name: string; scope: AdmitScope; project?: string }): boolean {
  return a.name === b.name && a.scope === b.scope && a.project === b.project;
}

export function proposeOne(incoming: IncomingSkill, existing: readonly ExistingSkill[]): AdmitProposal {
  const integrity = checkSkillAddition(
    { name: incoming.name, scope: incoming.scope, body: incoming.content },
    existing.filter((e) => inLineage(e, incoming)).map((e) => ({ name: e.name, scope: e.scope })),
  );
  const base = {
    name: incoming.name,
    scope: incoming.scope,
    requiredConfirmer: requiredConfirmer(incoming.scope),
    integrity,
    ...(incoming.project ? { project: incoming.project } : {}),
  };

  // Governance first: a name that lives above you is inherited, never copied down.
  if (integrity.relation === "inherit-conflict") {
    const from = LAYER_POLICY[integrity.inheritsFrom!].label;
    return { ...base, status: "inherit", recommendation: `Already governed at the ${from} layer above you — inherit it, don't copy it down.` };
  }
  // A structural problem (path-unsafe name, oversized body) blocks regardless of drift.
  if (!integrity.admissible) {
    return { ...base, status: "new", recommendation: `Cannot add as-is: ${integrity.problems[0]!.message}.` };
  }

  const clash = existing.find((e) => sameSlot(e, incoming));
  if (!clash) {
    return { ...base, status: "new", recommendation: `Add at ${incoming.scope}. No skill by this name here yet.` };
  }

  const verdict = classifyVariants([
    { source: "incoming", content: incoming.content },
    { source: "hive", content: clash.content },
  ]);
  if (verdict.status === "identical") {
    return { ...base, status: "identical", verdict, recommendation: "Already in the hive, unchanged. Nothing to do." };
  }
  return {
    ...base,
    status: "diverged",
    verdict,
    recommendation: `Conflicts with the hive copy (${verdict.summary}). Decide: replace the hive copy, keep it as a scoped override, or reject.`,
  };
}

export function propose(incoming: readonly IncomingSkill[], existing: readonly ExistingSkill[]): AdmitProposal[] {
  return incoming.map((s) => proposeOne(s, existing));
}

// ---- confirm + accept ----

export interface Decision {
  readonly name: string;
  readonly scope: AdmitScope;
  readonly project?: string;
  readonly accept: boolean;
  /** The verified principal confirming. Their role and tenant are checked against what the
   *  scope requires (authority.canConfirm), not taken on trust as a self-declared string. */
  readonly by: Principal;
  readonly reason?: string;
}

export interface AuditEntry {
  readonly action: "admitted" | "skipped";
  readonly name: string;
  readonly scope: AdmitScope;
  readonly project?: string;
  readonly status: AdmitStatus;
  /** The confirming principal's id (or "unconfirmed"), so the record names a who, not a what. */
  readonly by: string;
  readonly role?: Role;
  readonly reason?: string;
}

export interface AdmitResult {
  readonly applied: readonly IncomingSkill[];
  readonly audit: readonly AuditEntry[];
  readonly skipped: readonly AdmitProposal[];
}

/**
 * Apply only the decisions a human confirmed, and only when the confirmer holds the
 * authority the scope requires. An accept from the wrong role does not take: it is
 * skipped, recorded, and (in a real deployment) routed to whoever can confirm it.
 */
export function applyDecisions(
  incoming: readonly IncomingSkill[],
  proposals: readonly AdmitProposal[],
  decisions: readonly Decision[],
): AdmitResult {
  const applied: IncomingSkill[] = [];
  const audit: AuditEntry[] = [];
  const skipped: AdmitProposal[] = [];

  for (const p of proposals) {
    const d = decisions.find((x) => sameSlot(x, p));
    const skill = incoming.find((s) => sameSlot(s, p));
    // The principal's role and tenant are checked against what the scope requires; a
    // tenant-scoped skill's tenant is its project. A platform-owner change is tenant-unbound.
    const auth: AuthorityDecision = d?.accept === true ? canConfirm(d.by, p.scope, p.project) : { ok: false };
    // Three gates, all required: a human ticked it, an authorised principal confirmed it,
    // and the tree-integrity guard admits it. A ticked upward-duplicate still does not take.
    const authorised = d?.accept === true && auth.ok && skill !== undefined && p.integrity.admissible;

    if (authorised) {
      applied.push(skill);
      audit.push({
        action: "admitted",
        name: p.name,
        scope: p.scope,
        status: p.status,
        by: d.by.id,
        role: d.by.role,
        ...(p.project ? { project: p.project } : {}),
        ...(d.reason ? { reason: d.reason } : {}),
      });
    } else {
      skipped.push(p);
      const blockedReason = !p.integrity.admissible
        ? p.integrity.problems[0]?.message
        : d?.accept === true && !auth.ok
          ? auth.reason
          : undefined;
      audit.push({
        action: "skipped",
        name: p.name,
        scope: p.scope,
        status: p.status,
        by: d?.by.id ?? "unconfirmed",
        ...(d?.by.role ? { role: d.by.role } : {}),
        ...(p.project ? { project: p.project } : {}),
        ...(blockedReason ? { reason: blockedReason } : {}),
      });
    }
  }

  return { applied, audit, skipped };
}

// ---- the review surface (the drift note a human reads and ticks) ----

export function renderProposal(proposals: readonly AdmitProposal[]): string {
  const where = (p: AdmitProposal): string => `${p.scope}${p.project ? `/${p.project}` : ""}`;
  const flagNotes = (p: AdmitProposal): string[] =>
    p.integrity.flags.map((f) => `    - ⚠ ${f.message}`);

  const blocked = proposals.filter((p) => !p.integrity.admissible);
  const admissible = proposals.filter((p) => p.integrity.admissible);
  const news = admissible.filter((p) => p.status === "new");
  const identical = admissible.filter((p) => p.status === "identical");
  const diverged = admissible.filter((p) => p.status === "diverged");

  const lines: string[] = ["# Admit review", ""];
  lines.push(`${proposals.length} skill(s): ${news.length} new, ${diverged.length} conflict, ${identical.length} already present, ${blocked.length} blocked.`);
  lines.push("Tick a box to confirm. Nothing is applied until you do.");
  lines.push("");

  lines.push("## Needs your decision");
  if (diverged.length === 0) lines.push("- none");
  for (const p of diverged) {
    lines.push(`- [ ] **${p.name}** (${where(p)}) — ${p.recommendation} _Confirmer: ${p.requiredConfirmer}._`);
    lines.push(...flagNotes(p));
  }
  lines.push("");

  lines.push("## Safe to wave through");
  if (news.length + identical.length === 0) lines.push("- none");
  for (const p of [...news, ...identical]) {
    lines.push(`- [ ] **${p.name}** (${where(p)}) — ${p.recommendation}`);
    lines.push(...flagNotes(p));
  }
  lines.push("");

  lines.push("## Cannot add (the tree decides, not the tick)");
  if (blocked.length === 0) lines.push("- none");
  for (const p of blocked) {
    lines.push(`- **${p.name}** (${where(p)}) — ${p.recommendation}`);
    lines.push(...flagNotes(p));
  }
  lines.push("");
  return lines.join("\n");
}
