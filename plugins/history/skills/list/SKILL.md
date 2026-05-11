---
description: List every shadow-history repo on this machine with size, commit count, and source workspace path.
when_to_use: Use when the user asks "what shadow repos do I have", "what's in ~/.claude-history", or wants to see disk usage of the history plugin.
allowed-tools: Bash
---

## Shadow-history repos on this machine

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history-admin" list
```

After running, print the bash block's output verbatim — no preamble or summary. Exception: if anything looks like an orphan candidate (workspace marked `(unknown)`, source path under `/tmp` or `/var/folders`, suspiciously large size for few commits), add one short note after the output pointing it out.
