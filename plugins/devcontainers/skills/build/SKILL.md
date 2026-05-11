---
description: Build the devcontainer image. Default builds the primary container via the devcontainer CLI; --service <name> builds a specific compose service via `docker compose build`.
when_to_use: Use when the user says "build the devcontainer", "rebuild the image", or wants to build a specific compose service.
argument-hint: "[--no-cache] [--service <name>]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" build $0
```
