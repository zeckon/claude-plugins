---
description: Turn on auto-push of shadow-history commits to the configured remote after every Claude turn. First call requires --yes after printing the workspace exclude-set as a privacy reminder.
when_to_use: Use when the user says "enable history push", "turn on auto-push", "start syncing history to remote", or wants new turns to push automatically.
argument-hint: "[--yes]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" push-enable $0
```
