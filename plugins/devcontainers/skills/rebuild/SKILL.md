---
description: Recreate the devcontainer (after editing devcontainer.json/Dockerfile/compose). Default uses `devcontainer up --remove-existing-container`; --service <name> recreates only a specific compose service via `docker compose up -d --force-recreate --no-deps`.
when_to_use: Use when the user says "rebuild the devcontainer", "apply config changes to the container", "recreate the dev container", or after editing devcontainer.json.
argument-hint: "[--service <name>]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" rebuild $0
```
