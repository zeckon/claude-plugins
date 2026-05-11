---
description: Run a command inside the devcontainer. Default targets the primary container via `devcontainer exec`; --service <name> targets any compose service via `docker compose exec`.
when_to_use: Use when the user says "run X inside the container", "exec into the devcontainer", or wants a command to run in a specific compose service.
argument-hint: "[--service <name>] -- <cmd...>"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" exec $0
```

If the inner command itself takes flags that overlap with the wrapper's (`--service`, `--no-cache`), put a `--` before the command so the wrapper stops parsing flags: `/devcontainers:exec -- ls --color`. Without `--`, those flags are intercepted by the wrapper.
