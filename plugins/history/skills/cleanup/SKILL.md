---
description: Compact all shadow-history repos and preview which ones look orphaned. Safe — does not delete anything by default. For actual deletes the user runs the CLI directly.
when_to_use: Use when the user wants to reclaim disk space from shadow-history repos, run gc, or audit orphan candidates.
allowed-tools: Bash
---

## Compacting all shadow repos (gc)

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history-admin" gc
```

## Orphan candidates (dry run — nothing deleted)

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/history-admin" prune-orphan --dry-run
```

After running, print both bash blocks' output verbatim — no preamble, do not summarize disk reclaimed or commit counts. Exception: if there are orphan candidates listed, add one short note after the output pointing at `history-admin prune-orphan` (or `history-admin remove <dirname>` for a specific one). Do not run the destructive command yourself.
