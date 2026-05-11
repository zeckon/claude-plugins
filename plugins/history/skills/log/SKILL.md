---
description: Show recent shadow-history commits for the current project. Each commit corresponds to one Claude turn, with the user's prompt as the commit message.
when_to_use: Use when the user asks "what have I been working on", "show recent prompts", "show turn history", or wants the raw list of past turns to copy refs from.
argument-hint: "[N]"
allowed-tools: Bash
---

## Recent shadow-history

The first column is the commit ref — paste it directly into `/history:show <ref>`, `/history:diff <ref>`, or `/history:transcript <ref>`.

```!
N="$0"
[ -z "$N" ] && N=20
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" log --no-color --no-decorate -n "$N" --reverse --format='%h  %<(70,trunc)%s'
echo
total=$(bash "${CLAUDE_PLUGIN_ROOT}/bin/history" rev-list --count HEAD 2>/dev/null || echo 0)
shown=$N
[ "$total" -lt "$N" ] && shown=$total
echo "(showing $shown of $total turns, oldest first; pass [N] to see more)"
```

After running, print the bash block's output verbatim — no preamble, no acknowledgments, no "showing commits above", no summary, no grouping. The user reads the refs directly to feed into other commands.
