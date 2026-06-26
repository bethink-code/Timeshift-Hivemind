// Admit: the one reusable operation for bringing a skill into the hive (steps 4-5 of
// ESTATE-ONBOARDING.md). Onboarding is this run in bulk; adding a skill later is this
// run once. Same path, parameterised by scope and by who must confirm.
//
// Human in the loop, always. propose() only describes and recommends; it never changes
// anything. applyDecisions() acts ONLY on items a human ticked, and ONLY when the
// person who ticked holds the authority that scope requires. Everything it does is
// recorded. Nothing moves without a confirmed decision from the right human.

import { classifyVariants, type DriftVerdict } from "./scan";

export type AdmitScope = "timeshift" | "tenant" | "agent";

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

export type AdmitStatus = "new" | "identical" | "diverged";

export interface AdmitProposal {
  readonly name: string;
  readonly scope: AdmitScope;
  readonly project?: string;
  readonly status: AdmitStatus;
  readonly recommendation: string;
  readonly verdict?: DriftVerdict;
  readonly requiredConfirmer: string;
}

/** Who must say yes to admit a skill at this scope. An agent-scope addition is
 *  behaviour a staff member cannot wave through themselves (L9), so it escalates to the
 *  admin: the engine routes the confirmation up rather than deciding for anyone. */
export function requiredConfirmer(scope: AdmitScope): string {
  switch (scope) {
    case "timeshift":
      return "platform-owner";
    case "tenant":
      return "tenant-admin";
    case "agent":
      return "tenant-admin";
  }
}

function sameSlot(a: { name: string; scope: AdmitScope; project?: string }, b: { name: string; scope: AdmitScope; project?: string }): boolean {
  return a.name === b.name && a.scope === b.scope && a.project === b.project;
}

export function proposeOne(incoming: IncomingSkill, existing: readonly ExistingSkill[]): AdmitProposal {
  const base = {
    name: incoming.name,
    scope: incoming.scope,
    requiredConfirmer: requiredConfirmer(incoming.scope),
    ...(incoming.project ? { project: incoming.project } : {}),
  };

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
  /** Who confirmed. Must match the proposal's requiredConfirmer for the accept to take. */
  readonly by: string;
  readonly reason?: string;
}

export interface AuditEntry {
  readonly action: "admitted" | "skipped";
  readonly name: string;
  readonly scope: AdmitScope;
  readonly project?: string;
  readonly status: AdmitStatus;
  readonly by: string;
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
    const authorised = d?.accept === true && d.by === p.requiredConfirmer && skill !== undefined;

    if (authorised) {
      applied.push(skill);
      audit.push({
        action: "admitted",
        name: p.name,
        scope: p.scope,
        status: p.status,
        by: d.by,
        ...(p.project ? { project: p.project } : {}),
        ...(d.reason ? { reason: d.reason } : {}),
      });
    } else {
      skipped.push(p);
      audit.push({
        action: "skipped",
        name: p.name,
        scope: p.scope,
        status: p.status,
        by: d?.by ?? "unconfirmed",
        ...(p.project ? { project: p.project } : {}),
      });
    }
  }

  return { applied, audit, skipped };
}

// ---- the review surface (the drift note a human reads and ticks) ----

export function renderProposal(proposals: readonly AdmitProposal[]): string {
  const where = (p: AdmitProposal): string => `${p.scope}${p.project ? `/${p.project}` : ""}`;
  const news = proposals.filter((p) => p.status === "new");
  const identical = proposals.filter((p) => p.status === "identical");
  const diverged = proposals.filter((p) => p.status === "diverged");

  const lines: string[] = ["# Admit review", ""];
  lines.push(`${proposals.length} skill(s): ${news.length} new, ${diverged.length} conflict, ${identical.length} already present.`);
  lines.push("Tick a box to confirm. Nothing is applied until you do.");
  lines.push("");

  lines.push("## Needs your decision");
  if (diverged.length === 0) lines.push("- none");
  for (const p of diverged) {
    lines.push(`- [ ] **${p.name}** (${where(p)}) — ${p.recommendation} _Confirmer: ${p.requiredConfirmer}._`);
  }
  lines.push("");

  lines.push("## Safe to wave through");
  if (news.length + identical.length === 0) lines.push("- none");
  for (const p of [...news, ...identical]) {
    lines.push(`- [ ] **${p.name}** (${where(p)}) — ${p.recommendation}`);
  }
  lines.push("");
  return lines.join("\n");
}
