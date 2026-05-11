---
description: Pull the full Claude Code transcript (prompt, assistant response, tool calls, tool results) for the turn that produced a specific shadow-history commit. Uses the Session trailer baked into the commit to find the original session JSONL under ~/.claude/projects/.
when_to_use: Use when the user asks "show full transcript for <sha>", "what actually happened on turn X", "expand commit <sha>", or wants the un-truncated assistant response.
argument-hint: "<ref>"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" transcript "$0"
```

After running, print the bash block's output verbatim — no preamble or summary. Exception: if the wrapper printed a "transcript file not found" or "no Session trailer" error, surface that one-line error verbatim and stop.
