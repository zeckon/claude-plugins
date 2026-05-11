---
description: One-shot manual push of shadow-history commits to the configured remote. Pushes this machine's branch (host/<hostname>). Works whether auto-push is on or off.
when_to_use: Use when the user says "push history", "sync history now", "push history to remote", or wants to flush a backlog after enabling the remote.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" push
```
