# Remote sync

Shadow repos are local-only by default. The remote-sync feature is opt-in and adds two capabilities:

- **Backup.** A laptop dying takes its prompt history with it; pushing to a private git remote prevents that.
- **Multi-machine view.** Working on the same project from desktop + laptop normally produces two disjoint local histories. With a shared remote, each machine pushes to its own branch (`host/<hostname>`), so you can browse another machine's turns without merging.

## Setup

```text
/history:remote git@github.com:me/claude-history-myproject.git
/history:push-enable --yes
```

`/history:push-enable` prints the workspace's `info/exclude` set on its first call and refuses without `--yes`. The shadow repo captures full workspace diffs after every turn — anything outside that exclude list (including any secrets in tracked files) gets pushed upstream. Use a private repo and add anything sensitive to `~/.claude-history/<dir>/info/exclude` before enabling.

## Branch model

Each machine pushes to `host/<hostname -s>`. Two machines on the same project don't merge histories — they each append linearly to their own branch. To see another machine's history:

```text
/history:pull
```

…then browse `origin/host/<otherhost>` directly with `bin/history log origin/host/<otherhost>`.

## Auto-push behavior

When auto-push is on, the `Stop` hook forks `git push` in the background after the local commit lands. The hook does not wait for the push to complete — turn end stays fast even if the remote is slow or unreachable. Output from the most recent push goes to `<shadow-repo>/push.log` for debugging.

`/history:status` shows ahead-count vs `origin/host/<hostname>`, so a stuck push is visible without reading the log. To force a synchronous push (e.g. to resolve a backlog or before a laptop migration):

```text
/history:push
```

## New machine setup

To bootstrap an existing shared remote on a new machine, in the project's workspace:

```text
/history:clone git@github.com:me/claude-history-myproject.git
```

This creates the shadow repo for the current `$PWD`, fetches all remote branches, and opts the workspace in. Subsequent turns will auto-push if you also run `/history:push-enable --yes` on the new machine.

## Caveats

- Auth is whatever git already does (SSH keys, credential helper). The plugin doesn't manage credentials.
- Hostname collisions across two machines (same `hostname -s`) would mean both push to the same branch and conflict — rename one of them via `scutil --set ComputerName` (macOS) or change `/etc/hostname` (Linux) before enabling.
- Branch model is intentional: do not run `/history:pull` and merge into your host branch by hand. Each machine's branch is its own.
