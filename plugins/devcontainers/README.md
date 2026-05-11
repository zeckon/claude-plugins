# devcontainers

Claude Code plugin for [containers.dev](https://containers.dev/) dev containers. Authoring (`/devcontainers:init`, `/devcontainers:add-feature`), inspection (`/devcontainers:explain`, `/devcontainers:lint`, `/devcontainers:doctor`), upgrades (`/devcontainers:upgrade`), CLI installation (`/devcontainers:install-cli`), and CLI wrappers for the dev container lifecycle (`/devcontainers:validate`, `/devcontainers:build`, `/devcontainers:up`, `/devcontainers:exec`, `/devcontainers:rebuild`) — each with multi-service `--service` support for compose-based configs.

Two opt-in hooks layer on top: the **sandbox** hook routes Claude's non-allowlisted Bash calls into the container automatically; the **auto-rebuild** hook detects edits to `devcontainer.json` (and referenced compose/Dockerfile) and recreates the container so the change takes effect without a manual `/devcontainers:rebuild`.

## What it does

- **Author** a `.devcontainer/devcontainer.json` for the current project. `/devcontainers:init` reads your lockfiles and manifests, picks an appropriate base image (`mcr.microsoft.com/devcontainers/...`) and features (`ghcr.io/devcontainers/features/...`), and wires `postCreateCommand` to a real install command (`bun install` / `npm ci` / `pip install -r requirements.txt` / etc.).
- **Explain** an existing config in plain English. `/devcontainers:explain` follows Dockerfile / docker-compose references; for compose configs it enumerates every service and marks the primary.
- **Add features** by name. `/devcontainers:add-feature node` appends `ghcr.io/devcontainers/features/node:1` to your config. Idempotent.
- **Lint** against best practices. `/devcontainers:lint` checks for pinned versions, `remoteUser`, project install in `postCreateCommand` (not Dockerfile RUN), declared ports, plaintext secrets, and (for compose) a missing `service` field.
- **Upgrade** pinned features. `/devcontainers:upgrade` reports current vs latest published versions; `--apply` bumps tags.
- **Diagnose** the local environment. `/devcontainers:doctor` checks for Docker, Node.js, the `@devcontainers/cli`, and disk space, and prints what's missing with install hints.
- **Install** the CLI. `/devcontainers:install-cli` runs `npm install -g @devcontainers/cli`. Idempotent.
- **Run the dev container lifecycle.** `/devcontainers:validate`, `/devcontainers:build`, `/devcontainers:up`, `/devcontainers:exec`, and `/devcontainers:rebuild` wrap the `devcontainer` CLI. Each accepts `--service <name>` for compose-based configs to target any service (not just the primary).

## Multi-service compose support

For `dockerComposeFile` configs declaring more than one service, the `service` field in `devcontainer.json` selects the *primary* — the one Claude attaches to. `build`, `up`, `exec`, and `rebuild` all accept `--service <name>`:

- `--service` omitted, or matches the primary → routed through the `devcontainer` CLI (`devcontainer exec` / `devcontainer up` / etc.).
- `--service` names a non-primary service → routed through `docker compose` (`docker compose -p <project> -f <files> exec <name> ...`), since the `devcontainer` CLI itself only targets the primary.

The compose-file paths are read from `devcontainer read-configuration`'s merged output and resolved relative to the directory containing the active `devcontainer.json`. Multi-file `dockerComposeFile` arrays are handled.

### Run `up` first

The `--service` path needs the docker-compose project name the `devcontainer` CLI used when it brought the stack up. We discover it from a label on the running primary container (`devcontainer.local_folder=$PWD` → its `com.docker.compose.project`). **If no devcontainer is running for the current workspace, the wrappers refuse with "no running devcontainer found — run /devcontainers:up first".** Bring the primary up before targeting siblings; otherwise compose would invent its own project name and the sibling commands would land in a different namespace than the CLI created.

### Caveats

- **Non-primary services bypass `devcontainer` features.** `postCreateCommand`, `remoteUser`, lifecycle hooks etc. only run on the primary. If you need the same lifecycle for a sibling, declare it inside the compose file directly.
- **Argument quoting.** Skill `!` blocks substitute the slash-command argument list into a bash command line via word-splitting. Args that contain spaces or shell metacharacters (`;`, `|`, `&&`, `"`) won't survive the substitution intact. Stick to simple, unquoted args: `/devcontainers:exec --service db -- psql -U postgres`. If you need to pass a complex command, use `Bash` directly or place a script on disk and exec it.
- **`exec` flag intercept.** The wrapper parses `--service` and `--no-cache` no matter where they appear in the argv, so `exec ls --service` would be misread as `--service` (no value). When the inner command itself has flags, separate them with `--`: `/devcontainers:exec -- ls --color`.

## Slash commands

### Authoring & inspection

| Command | Description |
| --- | --- |
| `/devcontainers:init [--interactive]` | Scaffold `.devcontainer/devcontainer.json` for the current project. Refuses if one already exists. With `--interactive`, asks for confirmation before writing. |
| `/devcontainers:explain` | Read the active config (and referenced Dockerfile/compose) and summarize the dev environment in plain English. |
| `/devcontainers:add-feature <feature>[@version]` | Append a feature to the existing config. Accepts shorthand (`node`, `python`, `docker-in-docker`, ...) or fully-qualified OCI refs. |
| `/devcontainers:lint` | Review the active config against a best-practices checklist. Reports findings; does not auto-fix unless asked. |
| `/devcontainers:upgrade [--apply]` | Report current vs latest tags for pinned features. With `--apply`, edit the file to bump tags. |

### Environment

| Command | Description |
| --- | --- |
| `/devcontainers:doctor` | Probe Docker, Node, the CLI, and disk space; print findings with remediation hints. |
| `/devcontainers:install-cli` | Install `@devcontainers/cli` globally via npm. Idempotent. |

### Container lifecycle

| Command | Description |
| --- | --- |
| `/devcontainers:validate` | Read & validate the active config (parse + merged-config check). |
| `/devcontainers:build [--no-cache] [--service <name>]` | Build the container image. `--service` builds a specific compose service via `docker compose build`. |
| `/devcontainers:up [--service <name>]` | Bring up the container (or a specific compose service). |
| `/devcontainers:exec [--service <name>] -- <cmd...>` | Run a command inside the container. `--service` targets any compose service via `docker compose exec`. |
| `/devcontainers:rebuild [--service <name>]` | Recreate the container after config changes. `--service` recreates only that compose service. |

### Sandbox mode (opt-in)

| Command | Description |
| --- | --- |
| `/devcontainers:sandbox-on [--service <name>]` | Auto-route non-allowlisted Bash calls from Claude into the container via `devcontainer exec`. `--service` targets a non-primary compose service. Per-workspace; off by default. |
| `/devcontainers:sandbox-off` | Disable sandbox routing for this workspace. |

### Auto-rebuild (opt-in)

| Command | Description |
| --- | --- |
| `/devcontainers:autorebuild-on` | Watch `Edit`/`Write`/`MultiEdit` of devcontainer config files; auto-run `devcontainer up --remove-existing-container` when they change. Per-workspace; off by default. |
| `/devcontainers:autorebuild-off` | Stop watching. Edits no longer trigger automatic rebuilds. |

#### How it works

When sandbox mode is enabled, a `PreToolUse` hook fires for every `Bash` tool call and rewrites `tool_input.command` in-flight to:

```text
<plugin-root>/bin/devcontainers exec [--service <name>] -- bash -lc '<original command>'
```

The `bash -lc` wrapper preserves multi-statement commands (`a && b`, pipes, redirects).

#### Host-command allowlist

These first-token commands stay on the host even with sandbox enabled:

`git`, `gh`, `devcontainer`, `docker`, `docker-compose`, `claude`, `code`, `cd`, `pwd`, `echo`, `mkdir`, `ls`, `cat`, `which`, `command`.

Plus two conditional entries:

- `bash` — only when invoking `${CLAUDE_PLUGIN_ROOT}/...` (the plugin's own scripts must run on the host or the wrappers themselves would get re-routed).
- `npx` — only when invoking `@devcontainers/cli`.

The check is *first-token only*. `cd /tmp && some-command` keeps the entire line on the host because it begins with `cd`. If you need granular control, invoke `/devcontainers:exec` directly or use `/devcontainers:sandbox-off`.

#### Caveats

- **Hook fails open.** If anything goes wrong inside the hook (missing `jq`, malformed event JSON, internal error) the original command runs unchanged — a broken hook never blocks Claude's Bash tool.
- **No automatic `up`.** `sandbox-on` validates that a `devcontainer.json` exists and that `devcontainer` (or `npx`) is available, but it does not run `devcontainer up` for you. The first sandboxed Bash call surfaces any deeper problem (no daemon, image build failure, etc.). Run `/devcontainers:up` first if you want to be sure.
- **`--service` is host-resolved.** Non-primary services route through `docker compose exec`, which needs the docker-compose project name from a *running* primary container. Bring the primary up before relying on `--service`. (Same constraint as `/devcontainers:exec --service`.)
- **The hook fires on every Bash call.** When sandbox mode is *off* the script exits immediately on the missing flag file — but it's still a fork-per-Bash-call's worth of overhead. If that matters, uninstall the plugin when you don't need it.

### Auto-rebuild — how it works

When auto-rebuild is enabled, a `PostToolUse` hook fires for every successful `Edit`/`Write`/`MultiEdit`. If `tool_input.file_path` matches a watched location, the hook runs `bash <plugin-root>/bin/devcontainers rebuild` synchronously (foreground) so the user sees progress and any failure inline.

#### Watched paths

- `<workspace>/.devcontainer/devcontainer.json`
- `<workspace>/.devcontainer.json`
- Anything else under `<workspace>/.devcontainer/` (Dockerfile, compose, scripts the config references)
- Compose files declared in the active config's `dockerComposeFile` field — including those *outside* `.devcontainer/` (e.g. a top-level `docker-compose.yml`). Paths are canonicalized so `../docker-compose.yml` references resolve correctly against actual edited paths.

#### Caveats

- **Synchronous and slow.** Rebuilds typically take 30s–5min and block Claude's next turn. If you're making rapid successive config edits, run `/devcontainers:autorebuild-off`, finish editing, then `/devcontainers:rebuild` once at the end.
- **No debouncing.** Multiple watched edits in a row fire multiple rebuilds. v2 concern.
- **Single-service rebuild only.** The hook calls `rebuild` without `--service`, which recreates the primary container. For compose configs where you edited a *sibling* Dockerfile, the primary's image changes won't propagate — you'll still need `/devcontainers:rebuild --service <name>` manually after the autorebuild lands.
- **Hook fails open.** Any internal error (missing `jq`, malformed event JSON, broken config the CLI rejects) → the hook exits 0 with no rebuild. Better to skip a rebuild than break Edit/Write across an entire session.
- **Symlinked workspaces are partially handled.** `..`/`.` segments in paths are normalized, but if your workspace is reached via a symlink (`/Users/me/work` → `/Volumes/Data/work`) and Claude's `Edit`/`Write` tool delivers the canonical form, the hook's prefix check may miss. Workaround: `cd` to the realpath form before launching Claude. Tracked for a future fix.

## Install

Add the marketplace:

```text
/plugin marketplace add zeckon/claude-plugins
```

Install the plugin:

```text
/plugin install devcontainers@zeckon-claude-plugins
```

Installation does not modify your project. The skills are inert until you invoke one of them. The bundled hooks (`PreToolUse` for the `Bash` tool, `PostToolUse` for `Edit`/`Write`/`MultiEdit`) are registered but are no-ops until you enable sandbox / auto-rebuild for a specific workspace via `/devcontainers:sandbox-on` and `/devcontainers:autorebuild-on` respectively.

## Runtime requirements

- **Docker** running locally (or a remote daemon reachable via `DOCKER_HOST`). Required for `up`/`build`/`exec` (Phase 2). Authoring skills (`init`, `explain`, `add-feature`, `lint`, `upgrade`) work without Docker.
- **Node.js** for the `@devcontainers/cli`. Either install globally with `/devcontainers:install-cli`, or rely on the `npx -y @devcontainers/cli` fallback the plugin uses automatically.
- The CLI: <https://github.com/devcontainers/cli>.

## Permissions

The skills under this plugin invoke `bash`, so on first use Claude Code will prompt for permission to run them. Grant once and the plugin operates without further prompts.

## Per-workspace state

```text
~/.claude-devcontainers/<basename>-<6-char sha1 of $PWD>/
```

Tracked files:

- `workspace-root` — absolute path of the workspace this id belongs to (stamped on first state-dir use).
- `sandbox-enabled` — presence-based flag; written by `/devcontainers:sandbox-on`, removed by `/devcontainers:sandbox-off`.
- `sandbox-service` — optional; contains the compose service name when `sandbox-on --service <name>` was used.
- `autorebuild-enabled` — presence-based flag; written by `/devcontainers:autorebuild-on`, removed by `/devcontainers:autorebuild-off`.

`/devcontainers:doctor` prints the active state-dir path.

## Caveats

- `add-feature`'s shorthand table covers the common official features only. For third-party or less-common features, pass a fully-qualified OCI ref (e.g. `ghcr.io/owner/repo/feature:1`).
- `upgrade` reads the latest version from `raw.githubusercontent.com/devcontainers/features/main/src/<name>/devcontainer-feature.json`, not the OCI registry directly (the registry tags endpoint requires auth). Third-party features fall back to "manual check required".
- `init` writes a single-image config by default. Compose-based scaffolding is left to manual edit.
- `lint`'s heuristics are opinionated. Treat findings as advice, not gospel.

## Tests

Pure-bash test harness, isolated `$HOME` per test (so tests can't see real on-disk state):

```bash
bash plugins/devcontainers/tests/run-tests.sh
```

## Uninstall

```text
/plugin uninstall devcontainers@zeckon-claude-plugins
```

Uninstallation does not remove `~/.claude-devcontainers/`. Delete it manually if you want to reclaim the disk space.
