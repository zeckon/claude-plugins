---
description: Disable auto-rebuild for the current workspace. Edits to devcontainer config files no longer trigger an automatic rebuild; use /devcontainers:rebuild manually when needed.
when_to_use: Use when the user says "stop auto-rebuilding", "turn off auto-rebuild", or wants to make several config edits in a row without each one triggering a slow rebuild.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" autorebuild-off
```
