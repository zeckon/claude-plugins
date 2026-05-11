---
description: Opt the current project out of shadow-history capture. Existing shadow commits are preserved, but no new turns are captured until re-enabled.
when_to_use: Use when the user says "disable history", "pause history", or "stop tracking history" for this project.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" disable
```
