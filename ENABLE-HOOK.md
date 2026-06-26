# Enabling Hive Mode (the live SessionStart hook)

This is the one step that changes how every Claude session starts, so it is done
deliberately, together, with a backup already in place. Everything up to here is built
and proven; this file is the go-live checklist and the rollback.

## What it does

On each session start, a hook runs the materializer. It resolves the skills for the
current project out of the hive, clears the managed skills directory, writes the
resolved set, and tells Claude to reload. The skills directory becomes a throwaway
projection of the hive, rewritten every session.

## Safety already in place

- **Backup**: your original skills are copied to
  `~/.claude/backups/skills-pre-timeshift`. Rollback restores from there.
- **Fail safe**: if the materializer errors, it logs to stderr and exits 0 without
  printing reload. The session starts normally with whatever skills were already on
  disk. A TimeShift fault degrades to "no change", never to "no Claude".
- **The hive is the source of truth**: the 9 skills now live in `hive/`. The directory
  Claude reads is disposable.

## Prerequisite: build the command

```bash
npm run build:cli      # produces dist/materialize-cli.mjs (self-contained)
```

Re-run this whenever the materializer or engine changes.

## The command the hook runs

```
node "C:/LocalDev/TimeShift HiveMind 20260626/dist/materialize-cli.mjs" \
  --hive "C:/LocalDev/TimeShift HiveMind 20260626/hive" \
  --target "C:/Users/xumlu/.claude/skills" \
  --clean
```

`--target` is your live skills directory. `--clean` makes the hive own it (switching
projects removes the previous project's skills). Verified working against a sandbox;
the only change for go-live is pointing `--target` at the real directory.

## The settings.json entry

Confirmed against the Claude Code hooks docs. In `~/.claude/settings.json`, under
`"hooks"`:

```json
"SessionStart": [
  {
    "matcher": "startup|resume|clear",
    "hooks": [
      {
        "type": "command",
        "command": "node \"C:/LocalDev/TimeShift HiveMind 20260626/dist/materialize-cli.mjs\" --hive \"C:/LocalDev/TimeShift HiveMind 20260626/hive\" --target \"C:/Users/xumlu/.claude/skills\" --clean",
        "timeout": 30
      }
    ]
  }
]
```

- `matcher`: fires on new, resumed, and cleared sessions, not on mid-session compaction.
- The hook delivers the session `cwd` on stdin; the materializer reads it and maps it to
  a project key (no `--project` needed live).
- `reloadSkills` is printed on stdout and the command exits 0, so Claude re-scans in the
  same session. Both are already handled by the CLI.

## Project scoping (working)

The materializer resolves the project from the session `cwd` (read from the hook's stdin)
via `hive/projects.json`, which maps a path substring to a project key. Verified: a
`...THHP companion...` cwd resolves to `thhp`; a `...Molo...` cwd resolves to `molo` and
gets `molo-ui-design`. Global skills always materialize regardless, so an unmapped folder
still gets the full global set. To scope a new project's skills, add an entry to
`hive/projects.json` and tag the skill `"scope": "tenant", "project": "<key>"` in
`hive/manifest.json`.

## Rollback

If anything is off, restore the original skills and remove the hook:

```bash
rm -rf "/c/Users/xumlu/.claude/skills"
cp -r "/c/Users/xumlu/.claude/backups/skills-pre-timeshift" "/c/Users/xumlu/.claude/skills"
```

Then delete the `SessionStart` entry from `settings.json`. You are back to exactly the
prior state.
