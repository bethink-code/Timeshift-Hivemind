# TimeShift backlog

Future work, captured so it is not lost. Not built yet.

## Decided scope of the hive

The hive owns Garth's **authored** skill estate, not commodity upstream skills.

- **In**: personal skills (`~/.claude/skills`), the Molo/Bethink craft skills (currently
  delivered by the Claude app), and project-level skills across the dev folder.
- **Out**: the official Anthropic plugin marketplace (`claude-plugins-official` —
  Discord, Telegram, plugin-dev, mcp-server-dev, etc.). Commodity, upstream, not ours
  to govern. Leave it installed and untouched; the hive does not manage it.

## Sync skills from other repos (future source type)

Today the hive is populated by hand (migration copies). Add the ability to treat an
**external git repo as a skill source**, so curated skill sets can flow into the hive
without hand-copying, while the cascade still governs them.

Shape:

- `hive/sources.json` lists sources: each is a repo URL, a ref/branch, an optional
  subpath, and how its skills map into the tree (scope, and project key for tenant
  scope). Example: a Bethink internal skills repo mapped to `timeshift` (global), or a
  client-specific repo mapped to a tenant.
- A `sync` command clones or pulls each source and ingests its `SKILL.md` files into
  the hive, **stamping provenance** with the source repo and commit. The materializer
  and the oversight view then know where each skill came from and can flag drift when
  the source moves ahead.
- The repo is a **source, not an authority**. It feeds the hive; the hive composes.
  Scope, per-project availability, overrides, and mandates stay with the cascade, not
  with whoever wrote the repo.

Why it matters:

- It is the clean way to bring in shared skills we *do* want (a Bethink skills repo)
  without the copy-and-drift problem we just found across the dev projects.
- It is the path to sourcing the Molo/Bethink craft skills from a repo we control,
  instead of relying on the Claude app's per-session delivery bundle.
- It generalises: the official marketplace is one kind of external source we have
  chosen to exclude; other repos are sources we choose to include. Same mechanism,
  governed by us.

Open questions:

- Copy-into-hive vs reference-in-place (submodule / cached clone). Copy is simpler and
  makes the hive self-contained; reference stays current automatically but adds a
  dependency. Probably copy on `sync`, with the commit recorded.
- Conflict handling when two sources define the same skill name at the same scope
  (likely reuse the resolver's most-specific-wins, with source order as the tiebreak).
