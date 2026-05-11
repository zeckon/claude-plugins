---
description: Bootstrap a shadow-history repo for the current project from an existing remote. Use on a new machine to pull down history captured on another machine. Refuses if a shadow repo already exists for this workspace.
when_to_use: Use when the user says "clone history", "bootstrap history from remote", "set up history on this machine", or is moving to a new laptop/desktop and wants the existing remote.
argument-hint: "<url>"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" clone $0
```
