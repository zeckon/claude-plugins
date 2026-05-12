# zeckon-claude-plugins

Personal Claude Code plugin marketplace.

## Install

```text
/plugin marketplace add zeckon/claude-plugins
/plugin install <plugin>@zeckon-claude-plugins
```

## Plugins

| Plugin | Description |
| --- | --- |
| [`history`](plugins/history/README.md) | Auto-commits each Claude turn (prompt + workspace state) to a per-project shadow git repo, with skills to inspect and restore from the history. |
| [`devcontainers`](plugins/devcontainers/README.md) | Author, explain, lint, run, and sandbox via devcontainers (containers.dev). Optional opt-in hooks route Claude's Bash calls into the dev container and auto-rebuild on config edits. |

Each plugin's slash commands are namespaced as `/<plugin>:<skill>` (e.g. `/history:log`).

## Validate

```bash
claude plugin validate .
```

Run before opening a PR. Validates the marketplace manifest and every plugin's `plugin.json`, skill frontmatter, and `hooks/hooks.json`.

## Permissions

Each plugin's hooks and shell-injection skills will prompt for Bash permission on first use. Approve at **user scope** so the prompts don't repeat across projects. Per-plugin permission details live in each plugin's README.

## Contributing

Issue → branch → PR for every change, including docs and chores. The full flow and conventions live in [CLAUDE.md](CLAUDE.md). Adding a new plugin? See [CLAUDE.md § Plugin manifests](CLAUDE.md#plugin-manifests).

## Distribution

The marketplace is hosted at [github.com/zeckon/claude-plugins](https://github.com/zeckon/claude-plugins). See [Anthropic's marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces) for hosting and versioning details.
