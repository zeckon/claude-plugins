---
description: Read and validate the active .devcontainer config (parse + schema check via `devcontainer read-configuration`). Surfaces parse errors, missing fields, and merged config.
when_to_use: Use when the user says "validate my devcontainer", "check this config", or after editing devcontainer.json to confirm it still parses.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" validate
```
