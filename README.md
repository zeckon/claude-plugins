# zeckon-claude-plugins

Personal Claude Code plugin marketplace.

## Install

Add the marketplace:

```text
/plugin marketplace add zeckon/claude-plugins
```

Install a plugin:

```text
/plugin install history@zeckon-claude-plugins
```

## Plugins

| Plugin | Description |
| --- | --- |
| [`history`](plugins/history/README.md) | Auto-commits each Claude turn (prompt + workspace state) to a per-project shadow git repo, with skills to inspect and restore from the history. |

## Repo layout

```text
.
├── .claude-plugin/
│   └── marketplace.json     # marketplace manifest (name "zeckon-claude-plugins")
└── plugins/
    └── <plugin-name>/
        ├── .claude-plugin/
        │   └── plugin.json  # plugin manifest
        ├── hooks/           # event hooks (optional)
        ├── scripts/         # internal scripts called by hooks/skills
        ├── bin/             # user-facing wrapper executables (optional)
        └── skills/
            └── <name>/
                └── SKILL.md # one slash command per directory
```

Each plugin's slash commands are namespaced as `/<plugin>:<skill>` (e.g. `/history:log`).

## Add a new plugin

1. `mkdir -p plugins/<name>/.claude-plugin`
2. Write `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version`, `author`.
3. Add an entry to the `plugins` array in `.claude-plugin/marketplace.json` with `name` and `source: "./plugins/<name>"`.
4. Validate: `claude plugin validate .`
5. Refresh and install: `/plugin marketplace update zeckon-claude-plugins`, then `/plugin install <name>@zeckon-claude-plugins`.

## Validate

```bash
claude plugin validate .
```

This checks the marketplace manifest and every plugin's `plugin.json`, skill frontmatter, and `hooks/hooks.json` for syntax and schema errors.

## Permissions

Each plugin's hooks and shell-injection skills will prompt for Bash permission on first use. Approve at **user scope** so the prompts don't repeat across projects. Per-plugin permission details live in each plugin's README.

## Distribution

The marketplace is hosted at [github.com/zeckon/claude-plugins](https://github.com/zeckon/claude-plugins). See [Anthropic's marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces) for hosting and versioning details.
