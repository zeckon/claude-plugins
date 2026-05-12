# Growth and cleanup

A shadow repo grows with what *changes*, not with how many turns you take. Git is content-addressable, so unchanged files are not re-stored across commits, and every `git commit` triggers `git gc --auto`, which packs loose objects with delta compression once thresholds are reached. Within a single shadow repo, expect roughly:

- **Small project (≤ tens of MB), regular use**: a few MB after auto-gc, even after hundreds of turns.
- **Large project (hundreds of MB+), heavy churn**: tens to low hundreds of MB. Use `bin/history gc` to compact.

The real long-term issue is **orphan shadow repos** — every project you ever touch with this plugin enabled creates a `~/.claude-history/<…>.git`, and they survive even after you delete the source workspace.

## `bin/history-admin`

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
