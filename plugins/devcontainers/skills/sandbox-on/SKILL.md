---
description: Enable sandbox mode for the current workspace — Claude's non-allowlisted Bash invocations get auto-routed into the dev container via `devcontainer exec`. Off by default. `--service <name>` targets a non-primary compose service.
when_to_use: Use when the user says "sandbox claude in the container", "make agent run inside the devcontainer", "sandbox the agent", or wants Bash calls auto-routed via devcontainer exec.
argument-hint: "[--service <name>]"
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" sandbox-on $0
```

Once enabled, every non-allowlisted `Bash` tool call from Claude is rewritten in-flight to `devcontainer exec -- bash -lc '<original>'` (or `docker compose exec <service>` if `--service` was passed). Allowlisted host commands — `git`, `gh`, `docker`, `devcontainer`, `claude`, `code`, `cd`, `pwd`, `echo`, `mkdir`, `ls`, `cat`, `which`, `command`, plus `bash`/`npx` only when invoking the plugin's own scripts — still run on the host.

Disable with `/devcontainers:sandbox-off`.
