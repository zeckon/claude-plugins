# history

Auto-commits each Claude Code turn — your prompt plus the resulting workspace state — to a per-project shadow git repo. You get an audit trail of what every prompt did, plus skills to query and restore from it.

The shadow repo is a separate bare git repository — it does not touch the project's normal `.git/` directory.

## Install

```text
/plugin marketplace add zeckon/claude-plugins
/plugin install history@zeckon-claude-plugins
```

Installation alone doesn't capture anything — the plugin is **opt-in per workspace**. In each project where you want history captured:

```text
/history:enable
```

After that, every Claude turn in that workspace produces a shadow commit. To stop:

```text
/history:disable
```

Disabling unregisters the workspace but preserves the existing shadow repo. Re-enable later and capture resumes; commits remain on a single timeline.

The set of opted-in workspaces lives at `~/.claude-history/enabled-paths` — one absolute path per line. The hooks check this file on every `UserPromptSubmit` and `Stop`; if the current `$PWD` isn't listed, they exit silently.

## Slash commands

| Command | Description |
| --- | --- |
| `/history:enable` | Opt the current workspace in. Creates the shadow repo if it doesn't already exist. |
| `/history:disable` | Opt the current workspace out. Existing shadow repo is preserved. |
| `/history:status` | Show whether this workspace is enabled and where its shadow repo lives. |
| `/history:log [N]` | Show the last N turns (default 20) — prompt + sha. |
| `/history:diff [N]` | Diff the workspace against N turns ago (default 1). |
| `/history:show <ref>` | Show the prompt and full diff for a specific past turn. |
| `/history:transcript <ref>` | Pull the full transcript (all messages, tool calls, results) for the turn that produced the given commit. See [docs/commits.md](docs/commits.md). |
| `/history:restore <ref> <path>` | Restore one file from a past turn into the workspace. **Mutates the workspace.** Manual invocation only. |
| `/history:list` | List every shadow-history repo on this machine with size, commit count, and source workspace. |
| `/history:cleanup` | Compact (`git gc`) all shadow repos and dry-run the orphan check. Does not delete anything. |
| `/history:remote [<url>\|--clear]` | Show, set, or clear the git remote for this project's shadow repo. See [docs/remote-sync.md](docs/remote-sync.md). |
| `/history:push-enable [--yes]` | Turn on auto-push of new turns to the configured remote. First call requires `--yes` after a privacy reminder. |
| `/history:push-disable` | Turn off auto-push. Remote stays configured; manual `/history:push` still works. |
| `/history:push` | One-shot push to `host/<hostname>` on the configured remote. |
| `/history:pull` | `git fetch origin --prune` to refresh remote-tracking refs (other machines' branches). |
| `/history:clone <url>` | Bootstrap a shadow repo for the current project from an existing remote (new-machine setup). |

`<ref>` accepts anything git accepts: `HEAD`, `HEAD~3`, a sha, etc.

## Direct git access

`bin/history <git-args>` is a wrapper that resolves the correct shadow repo for `$PWD` and forwards arguments to git. Useful when you want any git operation the slash commands don't expose:

```bash
bin/history log --oneline -50
bin/history diff HEAD~3
bin/history grep "TODO" HEAD~5
bin/history reflog
bin/history gc                 # compact disk usage
```

The wrapper lives at `${CLAUDE_PLUGIN_ROOT}/bin/history`. It is intentionally invoked by absolute path, so it does not shadow the bash builtin `history`.

## Storage

```text
~/.claude-history/<basename>-<6-char sha1 of $PWD>.git
```

Example: a session in `/Users/me/workspace/myproject` writes to `~/.claude-history/myproject-a3f9b2.git`.

The `$PWD` hash makes paths unique across projects that share a basename. Each shadow repo also stores its source path at `<repo>/.workspace-path` for reverse lookup.

### Excluded by default

`.env`, `.env.*`, `node_modules/`, `dist/`, `build/`, `.DS_Store`, `*.log`, `.git/`.

To customize per-project, edit `~/.claude-history/<dir>/info/exclude` (this file is the bare-repo equivalent of `.gitignore`).

## Deep dives

- [docs/commits.md](docs/commits.md) — commit message structure (subject / body / trailers) and how to get the full transcript for a turn.
- [docs/sessions.md](docs/sessions.md) — multi-session attribution, concurrent-session contention, session_id trailer queries.
- [docs/remote-sync.md](docs/remote-sync.md) — opt-in push to a private git remote for backup and multi-machine views.
- [docs/maintenance.md](docs/maintenance.md) — growth expectations and `bin/history-admin` for cross-repo management.
- [docs/testing.md](docs/testing.md) — test suite layout and per-file coverage.

## Permissions

The plugin runs three Bash commands behind the scenes:

| When | Command |
| --- | --- |
| `UserPromptSubmit` (every prompt) | `bash <plugin>/scripts/hook-init.sh` |
| `Stop` (every Claude turn end) | `bash <plugin>/scripts/hook-commit.sh` |
| Inside slash commands | `bash <plugin>/bin/history …`, `bash <plugin>/bin/history-admin …` |

On first use Claude Code will prompt you to approve each one. Approve at **user scope** so the prompts don't repeat in every project.

### What the plugin does NOT do

- **No network by default.** All writes are local unless [remote sync](docs/remote-sync.md) is opt-in.
- **No reading of secrets.** The hook only reads the prompt JSON delivered by Claude Code on stdin, plus the workspace files that git would normally see.
- **No mutation outside `~/.claude-history/`** (and the workspace itself, only when `/history:restore` is invoked).

## Runtime requirements

- `git`
- `python3` (preinstalled on macOS; parses hook input JSON)
- `shasum` (preinstalled on macOS, standard on Linux)

The plugin does not auto-install dependencies. If git is missing, the hook exits silently — Claude Code keeps working, you just get no shadow commits.

## Caveats

- **Worktrees**: each `git worktree` has its own `$PWD`, so it gets its own shadow repo. Usually what you want, but worth knowing.
- **Symlinks**: shadow-repo selection is by logical `$PWD`, so different symlinks to the same directory produce different shadow repos.
- **Branch switches**: switching the project's branch mid-session produces a large diff in the next shadow commit. Not broken, just noisy.
- **Disk usage**: see [docs/maintenance.md](docs/maintenance.md).

## Uninstall

```text
/plugin uninstall history@zeckon-claude-plugins
```

Hooks stop firing immediately. Existing shadow repos remain at `~/.claude-history/`. To wipe them:

```bash
# inspect what's there first
bash ~/.claude/plugins/cache/zeckon-claude-plugins/history/<version>/bin/history-admin list
# then either:
rm -rf ~/.claude-history          # nuke everything
# or, while the plugin cache still exists:
bash ~/.claude/plugins/cache/zeckon-claude-plugins/history/<version>/bin/history-admin remove <dirname>
```
