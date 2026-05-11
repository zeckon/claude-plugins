---
description: Opt the current project into shadow-history capture. After this, every Claude turn auto-commits the workspace state to the shadow repo.
when_to_use: Use when the user says "enable history", "start tracking history", or "turn on history" for this project.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" enable
```
