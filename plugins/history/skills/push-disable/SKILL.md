---
description: Turn off auto-push of shadow-history commits. The remote URL stays configured; turns just stop pushing automatically. Manual `/history:push` still works.
when_to_use: Use when the user says "disable history push", "turn off auto-push", "stop syncing history", or wants new turns to stop pushing automatically.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" push-disable
```
