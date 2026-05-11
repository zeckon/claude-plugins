---
description: Fetch updates from the configured remote so this machine sees other machines' shadow-history branches. Runs `git fetch origin --prune` against the bare repo — no merge.
when_to_use: Use when the user says "pull history", "fetch history", "sync history from remote", or wants the latest remote-tracking refs (e.g. to browse another machine's turns).
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" pull
```
