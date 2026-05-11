---
description: Probe the local environment for everything the devcontainers plugin needs (Docker daemon, Node.js, @devcontainers/cli) and report findings with remediation hints.
when_to_use: Use when the user says "check my devcontainers setup", "doctor", "is everything ready for devcontainers", or before running other devcontainers skills for the first time.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" doctor
```
