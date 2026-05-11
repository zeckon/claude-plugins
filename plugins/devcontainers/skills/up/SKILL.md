---
description: Bring up the devcontainer (or a specific compose service with --service <name>). Wraps `devcontainer up`; falls back to `docker compose up -d <service>` for non-primary compose services.
when_to_use: Use when the user says "start the devcontainer", "bring up the dev container", or wants to start a specific compose service.
argument-hint: "[--service <name>]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" up $0
```
