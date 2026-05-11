# history

Auto-commits each Claude Code turn — your prompt plus the resulting workspace state — to a per-project shadow git repo. You get an audit trail of what every prompt did, plus skills to query and restore from it.

## What gets captured

- **One commit per Claude turn.** A "turn" is one user prompt + Claude's response.
- **Commit content** = the entire workspace tree at the moment Claude stops responding.
- **Commit message** = a structured record of the turn:
  - **Subject** = your prompt (first line, truncated if very long).
  - **Body** = full prompt (when multi-line), an excerpt of Claude's response (~1KB), and an Activity block (files changed + tool call summary).
  - **Trailers** = git-parseable key/value lines: `Session`, `Model`, `Tokens-In`, `Tokens-Out`, `Cache-Read`, `Cache-Created`, `Duration`, `Tools`, `Files-Changed`. Useful for `git log --format='%(trailers:key=Tokens-In,valueonly)'` style queries.

The body deliberately keeps only an excerpt so commits stay readable. To get the full transcript for any turn — every assistant message, every tool call, every result — use `/history:transcript <ref>` (or `bin/history transcript <ref>`). It reads the `Session` trailer, locates the original Claude Code session JSONL under `~/.claude/projects/`, and pretty-prints every event whose timestamp falls inside the commit's window. If Claude Code has rotated the session log, the command says so.

The shadow repo is a separate bare git repository — it does not touch the project's normal `.git/` directory.

## Storage

```text
~/.claude-history/<basename>-<6-char sha1 of $PWD>.git
```

Example: a session in `/Users/me/workspace/myproject` writes to `~/.claude-history/myproject-a3f9b2.git`.

The `$PWD` hash makes paths unique across projects that share a basename. The basename stays human-readable for `ls`/`grep`. Each shadow repo also stores its source path at `<repo>/.workspace-path` for reverse lookup.

### Excluded by default

`.env`, `.env.*`, `node_modules/`, `dist/`, `build/`, `.DS_Store`, `*.log`, `.git/`.

To customize per-project, edit `~/.claude-history/<dir>/info/exclude` (this file is the bare-repo equivalent of `.gitignore`).

## Install

Add the marketplace:

```text
/plugin marketplace add zeckon/claude-plugins
```

Install the plugin:

```text
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

### How opt-in is stored

The set of opted-in workspaces lives at `~/.claude-history/enabled-paths` — one absolute path per line. The hooks check this file on every `UserPromptSubmit` and `Stop`; if the current `$PWD` isn't listed, they exit silently. You can edit the file directly if you ever want to bulk enable/disable.

## Slash commands

| Command | Description |
| --- | --- |
| `/history:enable` | Opt the current workspace in. Creates the shadow repo if it doesn't already exist. |
| `/history:disable` | Opt the current workspace out. Existing shadow repo is preserved. |
| `/history:status` | Show whether this workspace is enabled and where its shadow repo lives. |
| `/history:log [N]` | Show the last N turns (default 20) — prompt + sha. |
| `/history:diff [N]` | Diff the workspace against N turns ago (default 1). |
| `/history:show <ref>` | Show the prompt and full diff for a specific past turn. |
| `/history:transcript <ref>` | Pull the full Claude Code transcript (all messages, tool calls, results) for the turn that produced the given commit, by following the commit's `Session` trailer to the original session JSONL. |
| `/history:restore <ref> <path>` | Restore one file from a past turn into the workspace. **Mutates the workspace.** Manual invocation only — `disable-model-invocation: true`. |
| `/history:list` | List every shadow-history repo on this machine with size, commit count, and source workspace. |
| `/history:cleanup` | Compact (`git gc`) all shadow repos and dry-run the orphan check. Does not delete anything. |
| `/history:remote [<url>\|--clear]` | Show, set, or clear the git remote for this project's shadow repo. |
| `/history:push-enable [--yes]` | Turn on auto-push of new turns to the configured remote. First call requires `--yes` after a privacy reminder. |
| `/history:push-disable` | Turn off auto-push. Remote stays configured; manual `/history:push` still works. |
| `/history:push` | One-shot push to `host/<hostname>` on the configured remote. |
| `/history:pull` | `git fetch origin --prune` to refresh remote-tracking refs (other machines' branches). |
| `/history:clone <url>` | Bootstrap a shadow repo for the current project from an existing remote (new-machine setup). |

`<ref>` accepts anything git accepts: `HEAD`, `HEAD~3`, a sha, etc.

## Direct git access

`bin/history <git-args>` is a wrapper that resolves the correct shadow repo for `$PWD` and forwards arguments to git. It's the building block underneath the slash commands and is useful when you want any git operation the slash commands don't expose.

```bash
bin/history enable             # opt this workspace in
bin/history disable            # opt out (alias: pause)
bin/history status             # show enable state + repo path
bin/history transcript HEAD    # full session transcript for a commit
bin/history log --oneline -50
bin/history diff HEAD~3
bin/history show <sha>
bin/history grep "TODO" HEAD~5
bin/history reflog
bin/history gc                 # compact disk usage
```

The wrapper lives at `${CLAUDE_PLUGIN_ROOT}/bin/history`. It is intentionally invoked by absolute path, so it does not shadow the bash builtin `history`.

## Multiple sessions on the same project

All Claude Code sessions running in the same `$PWD` write to the **same** shadow repo. This is deliberate — you get one continuous timeline regardless of how many sessions you've run on a project, and a session that resumes (`claude --resume`) keeps the same `session_id` so its commits stay contiguous.

To keep commits from different sessions distinguishable, every shadow commit gets a `Session: <session_id>` trailer in its message. Useful queries:

```bash
# show only commits from a specific session
bin/history log --grep "Session: <session-id>"

# list every session_id that has touched this repo
bin/history log --format='%(trailers:key=Session,valueonly,unfold)' | sort -u

# show recent commits with their session id alongside
bin/history log --format='%h %s%n  session: %(trailers:key=Session,valueonly,unfold)' --no-color
```

### Concurrent sessions

If two Claude Code sessions are running on the same workspace at the same time:

- **Prompt attribution is correct.** `UserPromptSubmit` writes the prompt to a session-scoped file (`$GIT_DIR/.last-prompt-<session_id>`), and `Stop` reads the matching one for its session — no cross-session clobbering.
- **Concurrent commits rely on git's index lock.** Two `git commit`s firing within milliseconds of each other contend on `.git/index`. Common case: one waits briefly, both succeed. Rare case: a turn's commit drops. The shadow repo itself stays consistent.

If you need bulletproof concurrent capture (e.g. parallel agents), run them from separate `git worktree` checkouts — a different `$PWD` resolves to a different shadow repo, so there's no contention.

## Remote sync

Shadow repos are local-only by default. The remote-sync feature is opt-in and adds two capabilities:

- **Backup.** A laptop dying takes its prompt history with it; pushing to a private git remote prevents that.
- **Multi-machine view.** Working on the same project from desktop + laptop normally produces two disjoint local histories. With a shared remote, each machine pushes to its own branch (`host/<hostname>`), so you can browse another machine's turns without merging.

### Setup

```text
/history:remote git@github.com:me/claude-history-myproject.git
/history:push-enable --yes
```

`/history:push-enable` prints the workspace's `info/exclude` set on its first call and refuses without `--yes`. The shadow repo captures full workspace diffs after every turn — anything outside that exclude list (including any secrets in tracked files) gets pushed upstream. Use a private repo and add anything sensitive to `~/.claude-history/<dir>/info/exclude` before enabling.

### Branch model

Each machine pushes to `host/<hostname -s>`. Two machines on the same project don't merge histories — they each append linearly to their own branch. To see another machine's history:

```text
/history:pull
```

…then browse `origin/host/<otherhost>` directly with `bin/history log origin/host/<otherhost>`.

### Auto-push behavior

When auto-push is on, the `Stop` hook forks `git push` in the background after the local commit lands. The hook does not wait for the push to complete — turn end stays fast even if the remote is slow or unreachable. Output from the most recent push goes to `<shadow-repo>/push.log` for debugging.

`/history:status` shows ahead-count vs `origin/host/<hostname>`, so a stuck push is visible without reading the log. To force a synchronous push (e.g. to resolve a backlog or before a laptop migration):

```text
/history:push
```

### New machine setup

To bootstrap an existing shared remote on a new machine, in the project's workspace:

```text
/history:clone git@github.com:me/claude-history-myproject.git
```

This creates the shadow repo for the current `$PWD`, fetches all remote branches, and opts the workspace in. Subsequent turns will auto-push if you also run `/history:push-enable --yes` on the new machine.

### Caveats

- Auth is whatever git already does (SSH keys, credential helper). The plugin doesn't manage credentials.
- Hostname collisions across two machines (same `hostname -s`) would mean both push to the same branch and conflict — rename one of them via `scutil --set ComputerName` (macOS) or change `/etc/hostname` (Linux) before enabling.
- Branch model is intentional: do not run `/history:pull` and merge into your host branch by hand. Each machine's branch is its own.

## Growth and cleanup

A shadow repo grows with what *changes*, not with how many turns you take. Git is content-addressable, so unchanged files are not re-stored across commits, and every `git commit` triggers `git gc --auto`, which packs loose objects with delta compression once thresholds are reached. Within a single shadow repo, expect roughly:

- **Small project (≤ tens of MB), regular use**: a few MB after auto-gc, even after hundreds of turns.
- **Large project (hundreds of MB+), heavy churn**: tens to low hundreds of MB. Use `bin/history gc` to compact.

The real long-term issue is **orphan shadow repos** — every project you ever touch with this plugin enabled creates a `~/.claude-history/<…>.git`, and they survive even after you delete the source workspace. Use `bin/history-admin` to manage these across all repos.

### `bin/history-admin`

Cross-repo management — operates on every repo under `~/.claude-history/`. (For working with one repo's history, use `bin/history`.)

| Command | What it does |
| --- | --- |
| `history-admin list` | List all shadow repos with size, commit count, source workspace. |
| `history-admin gc` | Run `git gc --auto` on every repo. Safe; loses no history. Reports before/after sizes. |
| `history-admin prune-orphan [--dry-run]` | Delete shadow repos whose source workspace no longer exists on disk. |
| `history-admin prune-old <days> [--dry-run]` | Delete shadow repos with no activity in N days. |
| `history-admin remove <dirname>` | Delete one shadow repo by directory name. |

The `/history:list` and `/history:cleanup` slash commands wrap the safe subset (`list`, `gc`, dry-run orphan check). For actual deletes, run the CLI directly:

```bash
bash ~/.claude/plugins/cache/zeckon-claude-plugins/history/<version>/bin/history-admin prune-orphan
```

`prune-orphan` is the safest delete (only removes repos for paths that don't exist anymore). `prune-old` is age-based and easy to misjudge — always run it with `--dry-run` first.

## Permissions

The plugin runs three Bash commands behind the scenes:

| When | Command |
| --- | --- |
| `UserPromptSubmit` (every prompt) | `bash <plugin>/scripts/hook-init.sh` |
| `Stop` (every Claude turn end) | `bash <plugin>/scripts/hook-commit.sh` |
| Inside slash commands | `bash <plugin>/bin/history …`, `bash <plugin>/bin/history-admin …` |

On first use Claude Code will prompt you to approve each one. Approve at **user scope** so the prompts don't repeat in every project.

The plugin's actual on-disk path is `~/.claude/plugins/cache/zeckon-claude-plugins/history/<version>/…`, which is what permission rules will match against if you want to write rules manually.

### What the plugin does NOT do

- **No network by default.** All writes are local unless [Remote sync](#remote-sync) is opt-in via `/history:remote` + `/history:push-enable`.
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
- **Disk usage**: see [Growth and cleanup](#growth-and-cleanup) above. `git commit` already auto-packs; `bin/history gc` compacts on demand; `bin/history-admin prune-orphan` clears repos for vanished workspaces.
- **Remote sync is opt-in.** Shadow repos are local-only by default. See [Remote sync](#remote-sync) below to push to a private git remote for backup or multi-machine use.

## Tests

```bash
bash plugins/history/tests/run-tests.sh
```

The suite is plain bash — no test framework dependency. Each test runs in its own subshell with an isolated `$HOME` (a tmp dir under `/tmp/history-test-*`) so it cannot see or touch real shadow repos under `~/.claude-history/`. Cleanup runs via an `EXIT` trap so leaked tmp dirs don't accumulate even on failure.

Coverage:

| File | What it covers |
| --- | --- |
| `tests/test_paths.sh` | Path resolution: hash determinism, distinct PWDs → distinct repos, same basename in different parent dirs doesn't collide. |
| `tests/test_hooks.sh` | `hook-init` (repo creation, exclude file, workspace marker, per-session prompt files, idempotence, malformed JSON, missing session_id) and `hook-commit` (commit subject = prompt, Session trailer, "turn" fallback, no-op when no repo, exclude rules apply). Includes the **multi-session attribution** test — the regression test for the v0.1 prompt-mismatch race. |
| `tests/test_wrapper.sh` | `bin/history`: errors when no repo, forwards `log`/`show`/`diff` to git correctly. |
| `tests/test_admin.sh` | `bin/history-admin`: help, unknown-command rejection, `list` (empty + populated), `gc` preserves history, `prune-orphan` dry-run vs real, `prune-orphan` deletes orphans without touching alive repos, `remove` (incl. path-traversal rejection), `prune-old` validation. |
| `tests/test_e2e.sh` | Full lifecycle: three turns → diff between turns → restore from old ref. Session filtering via `--grep "Session: <id>"` and distinct-sessions extraction via `%(trailers:key=Session,valueonly,unfold)`. |
| `tests/test_optin.sh` | Opt-in flow: hooks no-op when not enabled, `enable` registers + creates repo, `disable`/`pause` unregister but preserve repo, `status` output, re-enable resumes capture, wrapper hints `enable` when not opted in. |
| `tests/test_validate.sh` | Runs `claude plugin validate` against the marketplace root. Catches manifest, `hooks/hooks.json`, and skill-frontmatter schema errors that the script-level tests can't see (they bypass the plugin loader). Requires the `claude` CLI on PATH. |
| `tests/test_message.sh` | `build-message.py`: subject derivation, prompt-section omitted when single-line, response excerpt + truncation, all trailers (Session, Model, Tokens-*, Cache-*, Duration, Tools, Files-Changed), graceful fallback when transcript missing. |
| `tests/test_transcript.sh` | `bin/history transcript`: unknown ref, missing repo/ref-arg, missing Session trailer, missing JSONL file, and end-to-end pretty-print with a synthetic transcript. |
| `tests/test_remote.sh` | Remote sync: `remote` set/show/clear, `push-enable` privacy gate + ack persistence, `push-disable`, manual `push` to a local bare-repo remote, `pull`, `clone` bootstrap (incl. refusing over an existing repo), `status` extension, and the hook's detached auto-push. |

To add a test: drop a `test_*` function into any `tests/test_*.sh` file. The runner discovers them automatically via `compgen -A function`.

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
