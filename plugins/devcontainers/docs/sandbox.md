# Sandbox mode

When sandbox mode is enabled for a workspace (`/devcontainers:sandbox-on`), the plugin's `PreToolUse` hook intercepts every `Bash` tool call from Claude and routes non-allowlisted commands into the dev container via `devcontainer exec`.

Sandbox mode is per-workspace and off by default. `/devcontainers:sandbox-off` disables it.

## How the rewrite works

For each `Bash` call, the hook rewrites `tool_input.command` in-flight to:

```text
<plugin-root>/bin/devcontainers exec [--service <name>] -- bash -lc '<original command>'
```

The `bash -lc` wrapper preserves multi-statement commands (`a && b`, pipes, redirects).

## Host-command allowlist

These first-token commands stay on the host even with sandbox enabled:

`git`, `gh`, `devcontainer`, `docker`, `docker-compose`, `claude`, `code`, `cd`, `pwd`, `echo`, `mkdir`, `ls`, `cat`, `which`, `command`

Plus two conditional entries:

- `bash` — only when invoking `${CLAUDE_PLUGIN_ROOT}/…` (the plugin's own scripts must run on the host or the wrappers themselves would get re-routed).
- `npx` — only when invoking `@devcontainers/cli`.

The check is **first-token only**. `cd /tmp && some-command` keeps the entire line on the host because it begins with `cd`. If you need granular control, invoke `/devcontainers:exec` directly or use `/devcontainers:sandbox-off`.

## Caveats

- **Hook fails open.** If anything goes wrong inside the hook (missing `jq`, malformed event JSON, internal error) the original command runs unchanged — a broken hook never blocks Claude's Bash tool.
- **No automatic `up`.** `sandbox-on` validates that a `devcontainer.json` exists and that `devcontainer` (or `npx`) is available, but does not run `devcontainer up`. The first sandboxed Bash call surfaces any deeper problem (no daemon, image build failure, etc.). Run `/devcontainers:up` first if you want to be sure.
- **`--service` is host-resolved.** Non-primary services route through `docker compose exec`, which needs the docker-compose project name from a *running* primary container. Bring the primary up before relying on `--service`. (Same constraint as `/devcontainers:exec --service`; see [compose.md](compose.md).)
- **The hook fires on every Bash call.** When sandbox mode is *off* the script exits immediately on the missing flag file — but it's still a fork-per-Bash-call of overhead. If that matters, uninstall the plugin when you don't need it.
