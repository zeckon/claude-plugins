---
description: Show what changed in the workspace since a past Claude turn. Diffs the current workspace (including uncommitted edits) against a shadow-history ref. Three input forms — `N` (bare integer): last N turns, i.e. `HEAD~N`; `HEAD~N` / `HEAD^N`: literal, no shift; any other ref (SHA, branch, tag): parent-shifted to `<ref>^` so the diff includes that turn's own changes (since shadow snapshots are taken after a turn finishes).
when_to_use: Use when the user asks "what changed since N prompts ago", "what's different from commit X", or wants to review accumulated changes. Note — to see what a single past turn did in isolation, use `/history:show <ref>` instead; that shows the commit against its parent, not against the live workspace.
argument-hint: "[N|ref]"
allowed-tools: Bash
---

## Diff: workspace vs $0 (default HEAD~1)

Shows what changed from `$0` → current workspace, including any uncommitted edits. SHA refs are parent-shifted so the diff includes that turn's own changes.

```!
ARG="$0"
[ -z "$ARG" ] && ARG=1
if [[ "$ARG" =~ ^[0-9]+$ ]]; then
  REF="HEAD~$ARG"
elif [[ "$ARG" =~ ^HEAD[~^][0-9]*$ ]] || [[ "$ARG" == "HEAD" ]]; then
  REF="$ARG"
else
  REF="$ARG^"
fi
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" diff --no-color "$REF" 2>&1 | head -c 200000
```

After running, print the bash block's output verbatim — no preamble or summary. Exception: if the diff was truncated mid-hunk by the 200KB cap, add one short sentence after the output telling the user to pass a smaller N or a more recent ref.
