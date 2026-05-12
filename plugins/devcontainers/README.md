# devcontainers

Claude Code plugin for [containers.dev](https://containers.dev/) dev containers. Author and inspect `devcontainer.json` configs, drive the container lifecycle (`up` / `build` / `exec` / `rebuild`), and — opt in per workspace — route Claude's Bash calls into the container or auto-rebuild on config edits.

## Install

```text
/plugin marketplace add zeckon/claude-plugins
/plugin install devcontainers@zeckon-claude-plugins
```

Installation doesn't modify your project. Skills are inert until invoked; the bundled hooks are registered but no-op until you opt a workspace in with `/devcontainers:sandbox-on` or `/devcontainers:autorebuild-on`.

## Runtime requirements

- **Docker** running locally (or remote via `DOCKER_HOST`) — needed for `up` / `build` / `exec` / `rebuild`. Authoring skills work without it.
- **Node.js** for `@devcontainers/cli`. Install globally with `/devcontainers:install-cli`, or rely on the plugin's automatic `npx -y @devcontainers/cli` fallback.

`/devcontainers:doctor` probes Docker, Node, the CLI, and disk space, and prints what's missing with install hints.

## Slash commands

### Authoring & inspection

| Command | Description |
| --- | --- |
| `/devcontainers:init [--interactive]` | Scaffold `.devcontainer/devcontainer.json` from lockfiles/manifests. Refuses if one already exists. With `--interactive`, asks for confirmation before writing. |
| `/devcontainers:explain` | Plain-English summary of the active config (follows Dockerfile/compose references). |
| `/devcontainers:add-feature <feature>[@version]` | Append a feature. Accepts shorthand (`node`, `python`, `docker-in-docker`, …) or fully-qualified OCI refs. Idempotent. |
| `/devcontainers:lint` | Check the active config against a best-practices checklist. Reports findings; doesn't auto-fix unless asked. |
| `/devcontainers:upgrade [--apply]` | Report current vs latest tags for pinned features. `--apply` bumps them. |

### Environment

| Command | Description |
| --- | --- |
| `/devcontainers:doctor` | Probe Docker, Node, the CLI, and disk space. |
| `/devcontainers:install-cli` | Install `@devcontainers/cli` globally via npm. Idempotent. |

### Container lifecycle

| Command | Description |
| --- | --- |
| `/devcontainers:validate` | Parse and validate the active config (merged-config check). |
| `/devcontainers:build [--no-cache] [--service <name>]` | Build the container image (or one compose service). |
| `/devcontainers:up [--service <name>]` | Bring up the container (or one compose service). |
| `/devcontainers:exec [--service <name>] -- <cmd…>` | Run a command inside the container. |
| `/devcontainers:rebuild [--service <name>]` | Recreate the container after config changes. |

`--service` targets any compose service — including non-primary ones. Routing rules and the "run `up` first" requirement: [docs/compose.md](docs/compose.md).

### Sandbox mode — opt-in, per workspace

| Command | Description |
| --- | --- |
| `/devcontainers:sandbox-on [--service <name>]` | Auto-route non-allowlisted Bash calls from Claude into the container via `devcontainer exec`. |
| `/devcontainers:sandbox-off` | Disable sandbox routing for this workspace. |

Rewrite mechanics, the host-command allowlist, and caveats: [docs/sandbox.md](docs/sandbox.md).

### Auto-rebuild — opt-in, per workspace

| Command | Description |
| --- | --- |
| `/devcontainers:autorebuild-on` | Watch `Edit` / `Write` / `MultiEdit` of devcontainer config files; auto-run `devcontainer up --remove-existing-container` when they change. |
| `/devcontainers:autorebuild-off` | Stop watching. |

Watched paths and caveats: [docs/auto-rebuild.md](docs/auto-rebuild.md).

## Per-workspace state

```text
~/.claude-devcontainers/<basename>-<6-char sha1 of $PWD>/
```

| File | Purpose |
| --- | --- |
| `workspace-root` | Absolute path of the workspace this id belongs to. Stamped on first state-dir use. |
| `sandbox-enabled` | Presence flag — set by `/devcontainers:sandbox-on`, removed by `-off`. |
| `sandbox-service` | Optional; compose service name when `sandbox-on --service <name>` was used. |
| `autorebuild-enabled` | Presence flag — set by `/devcontainers:autorebuild-on`, removed by `-off`. |

`/devcontainers:doctor` prints the active state-dir path.

## Permissions

The skills under this plugin invoke `bash`, so on first use Claude Code prompts for permission. Grant once and the plugin operates without further prompts.

## Caveats

- **`add-feature` shorthand** covers only the common official features. For third-party features, pass a fully-qualified OCI ref (e.g. `ghcr.io/owner/repo/feature:1`).
- **`upgrade`** reads latest versions from `raw.githubusercontent.com/devcontainers/features/main/src/<name>/devcontainer-feature.json`, not the OCI registry directly (the registry tags endpoint requires auth). Third-party features fall back to "manual check required".
- **`init`** writes a single-image config by default. Compose-based scaffolding is left to manual edit.
- **`lint`** is opinionated. Treat findings as advice, not gospel.

## Tests

```bash
bash plugins/devcontainers/tests/run-tests.sh
```

Pure-bash test harness; each test runs in an isolated `$HOME` so it can't see real on-disk state.

## Uninstall

```text
/plugin uninstall devcontainers@zeckon-claude-plugins
```

Uninstall does not remove `~/.claude-devcontainers/`. Delete it manually to reclaim the disk space.
