---
description: Enable auto-rebuild for the current workspace — editing .devcontainer/devcontainer.json (or any referenced Dockerfile/compose file) automatically runs `devcontainer up --remove-existing-container` so config changes propagate to the running container. Off by default.
when_to_use: Use when the user says "auto-rebuild on config changes", "make my devcontainer.json edits take effect automatically", "watch devcontainer config", or wants config edits to apply to the running container without a manual rebuild.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" autorebuild-on
```

Once enabled, every `Edit`/`Write` from Claude that touches a watched path triggers a foreground `devcontainer up --remove-existing-container --workspace-folder .`. Watched paths:

- `.devcontainer/devcontainer.json`
- `.devcontainer.json` at the workspace root
- Anything else under `.devcontainer/` (Dockerfile, compose files, scripts the config references)
- Compose files referenced via `dockerComposeFile` (resolved from the active config)

Rebuilds are slow (often 30s–5m) and run synchronously, so each watched edit pauses Claude until the container is back. Disable with `/devcontainers:autorebuild-off` if you're making rapid successive edits.
