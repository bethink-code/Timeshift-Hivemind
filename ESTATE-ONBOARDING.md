# Estate onboarding: the process the hive must own

## The lesson

The work is not fixing one person's skill estate. The work is that **everyone** who
adopts TimeShift arrives with the same mess we just found: skills scattered across
personal folders, an app-delivered bundle, and a pile of projects; the same skill
copied into several places; copies that have quietly drifted apart; two folder
conventions; no way to see what overrides what. And they will not have an expert beside
them to sort it out.

So the manual session that produced this insight is the specification for an engine
capability, not a task to do by hand. A founder (or a Claude) in the loop, deciding each
case personally, is exactly the defect V3 P4 forbids. The hive mind must run the whole
onboarding itself, and leave the human only the irreducible judgment, pre-chewed.

## The pipeline (what we did by hand, now the engine's job)

1. **Discover** every skill source on the machine. _Built: the estate scan._
2. **Inventory**: group by name, flag every skill that appears in more than one source.
   _Built: the scan's duplicate detection._
3. **Classify drift**: for each overlap, read the actual files and decide whether the
   copies are **identical** (a redundant duplicate) or **diverged** (either a deliberate
   override or stale drift). This is the step that turns "you can't tell" into a fact.
   _Built: the drift classifier._
4. **Propose resolution**, per case:
   - identical copies → the hive owns one canonical copy at the broadest scope; the
     others are redundant and retire.
   - diverged copies → present as a single yes/no with the diff in hand: is this an
     intentional override (keep it, scoped to that project) or drift to reconcile?
   _Next: the resolution wizard._
5. **Ingest** the chosen set into the hive, stamping provenance (source, and commit once
   repo-sync exists) so origin and future drift stay visible. _Next._
6. **Materialize** per session into the directory the tool reads. _Built: the hook._

## The principle

The human answers only what cannot be computed: for a *diverged* copy, "deliberate
override or stale?" Everything else — finding the sources, spotting the overlaps,
reading and diffing the copies, proposing the canonical home — is automatic. And even
that one question arrives with the difference already measured and shown. That is what
"the hive mind does this" means: not that it decides for you, but that it does all the
discovery and reasoning and hands you a single, informed choice.

## Status

The whole pipeline now exists as tested logic:

- Steps 1–3 (discover, inventory, classify) — the scan + drift classifier (`tools/scan.ts`),
  run read-only over the real estate.
- Steps 4–5 (propose, accept) — the admit flow (`tools/admit.ts`). `propose()` describes
  and recommends, changing nothing; `applyDecisions()` acts only on human-ticked items,
  and only when the confirmer holds the authority the scope requires (agent-scope
  escalates to the admin), recording every outcome.
- Step 6 (materialize) — the SessionStart hook, built and proven.

This is one reusable operation: onboarding runs it in bulk, adding a skill runs it once.
Nothing has touched the live estate.

Remaining to make it live (plumbing, not logic): wire `propose`/`accept` to the
filesystem — read the incoming skill(s), write a review note, read back the ticks, write
confirmed skills into the hive, and persist the audit trail. The decision logic and the
authority gate are done and tested; only the I/O edges remain.
