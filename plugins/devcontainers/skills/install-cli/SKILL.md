---
description: Install the @devcontainers/cli npm package globally so devcontainer commands run without `npx`. Detects existing installs and is idempotent.
when_to_use: Use when the user says "install devcontainer cli", "set up devcontainers", or after `/devcontainers:doctor` reports that no global CLI is installed.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" install-cli
```
