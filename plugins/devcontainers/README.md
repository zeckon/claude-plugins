# devcontainers

Claude Code plugin for [containers.dev](https://containers.dev/) dev containers. Author, inspect, lint, upgrade, and run the dev container lifecycle from slash commands — with optional opt-in hooks for sandboxing Claude's Bash calls and auto-rebuilding on config edits.

## Install

Register the marketplace (once per Claude Code instance — skip if you've already added it for another plugin):

```text
/plugin marketplace add zeckon/claude-plugins
```

Install this plugin:

```text
/plugin install devcontainers@zeckon-claude-plugins
```

Installation doesn't modify your project. Skills are inert until invoked. The bundled hooks are no-ops until you enable them with `/devcontainers:sandbox-on` or `/devcontainers:autorebuild-on`.

## Runtime requirements

- **Docker** running locally (or a remote daemon via `DOCKER_HOST`). Required for `up` / `build` / `exec`. Authoring skills (`init`, `explain`, `add-feature`, `lint`, `upgrade`) work without Docker.
- **Node.js** for the [`@devcontainers/cli`](https://github.com/devcontainers/cli). Install globally with `/devcontainers:install-cli`, or rely on the `npx -y @devcontainers/cli` fallback.

Run `/devcontainers:doctor` to probe the environment.

## Quick start

Scaffold a `devcontainer.json` for the current project. Refuses if one already exists:

```text
/devcontainers:init
```

Bring the container up (builds the image on first run):

```text
/devcontainers:up
```

Open an interactive shell inside the container:

```text
/devcontainers:exec -- bash
```

## Slash commands

### Authoring & inspection

| Command | Description |
| --- | --- |
| `/devcontainers:init [--interactive]` | Scaffold `.devcontainer/devcontainer.json` for the current project. Refuses if one already exists. With `--interactive`, asks for confirmation before writing. |
| `/devcontainers:explain` | Read the active config (and referenced Dockerfile / compose) and summarize the dev environment in plain English. |
| `/devcontainers:add-feature <feature>[@version]` | Append a feature to the existing config. Accepts shorthand (`node`, `python`, `docker-in-docker`, ...) or fully-qualified OCI refs. |
| `/devcontainers:lint` | Review the active config against a best-practices checklist. Reports findings; does not auto-fix unless asked. |
| `/devcontainers:upgrade [--apply]` | Report current vs latest tags for pinned features. With `--apply`, edit the file to bump tags. |

### Environment

| Command | Description |
| --- | --- |
| `/devcontainers:doctor` | Probe Docker, Node, the CLI, and disk space; print findings with remediation hints. |
| `/devcontainers:install-cli` | Install `@devcontainers/cli` globally via npm. Idempotent. |

### Container lifecycle

Each command accepts `--service <name>` for compose-based configs. See [docs/compose.md](docs/compose.md) for the primary-vs-sibling routing rules.

| Command | Description |
| --- | --- |
| `/devcontainers:validate` | Read & validate the active config (parse + merged-config check). |
| `/devcontainers:build [--no-cache] [--service <name>]` | Build the container image. |
| `/devcontainers:up [--service <name>]` | Bring up the container (or a specific compose service). |
| `/devcontainers:exec [--service <name>] -- <cmd...>` | Run a command inside the container. |
| `/devcontainers:rebuild [--service <name>]` | Recreate the container after config changes. |

### Sandbox mode (opt-in)

Auto-route non-allowlisted Bash calls from Claude into the container. See [docs/sandbox.md](docs/sandbox.md).

| Command | Description |
| --- | --- |
| `/devcontainers:sandbox-on [--service <name>]` | Enable sandbox routing for this workspace. |
| `/devcontainers:sandbox-off` | Disable. |

### Auto-rebuild (opt-in)

Recreate the container when `devcontainer.json` (or referenced files) change. See [docs/auto-rebuild.md](docs/auto-rebuild.md).

| Command | Description |
| --- | --- |
| `/devcontainers:autorebuild-on` | Enable auto-rebuild for this workspace. |
| `/devcontainers:autorebuild-off` | Disable. |

## Per-workspace state

```text
~/.claude-devcontainers/<basename>-<6-char sha1 of $PWD>/
```

Tracked files:

- `workspace-root` — absolute path of the workspace this id belongs to.
- `sandbox-enabled` — presence flag; written/removed by `sandbox-on` / `sandbox-off`.
- `sandbox-service` — optional compose service name when `sandbox-on --service <name>` was used.
- `autorebuild-enabled` — presence flag; written/removed by `autorebuild-on` / `autorebuild-off`.

`/devcontainers:doctor` prints the active state-dir path.

## Permissions

Skills invoke `bash`, so on first use Claude Code will prompt for permission. Grant once and the plugin operates without further prompts.

## Caveats

- `add-feature`'s shorthand table covers the common official features only. For third-party or less-common features, pass a fully-qualified OCI ref (e.g. `ghcr.io/owner/repo/feature:1`).
- `upgrade` reads the latest version from `raw.githubusercontent.com/devcontainers/features/main/src/<name>/devcontainer-feature.json`, not the OCI registry directly. Third-party features fall back to "manual check required".
- `init` writes a single-image config by default. Compose-based scaffolding is left to manual edit.
- `lint`'s heuristics are opinionated. Treat findings as advice, not gospel.

## Tests

```bash
bash plugins/devcontainers/tests/run-tests.sh
```

Pure-bash harness, isolated `$HOME` per test.

## Uninstall

```text
/plugin uninstall devcontainers@zeckon-claude-plugins
```

Uninstallation does not remove `~/.claude-devcontainers/`. Delete it manually if you want to reclaim the disk space.
