---
description: Show, set, or clear the git remote for the current project's shadow-history repo. With no argument prints the configured URL; with a URL replaces it; with --clear removes it.
when_to_use: Use when the user says "set history remote", "configure remote for history", "what's the history remote", "clear history remote", or asks to point shadow-history at a git remote.
argument-hint: "[<url>|--clear]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" remote $0
```
