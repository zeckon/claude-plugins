---
description: Restore a single file from a past shadow-history commit into the current workspace. MUTATES the workspace.
when_to_use: Manual invocation only — this skill should not auto-trigger.
argument-hint: "<ref> <path>"
disable-model-invocation: true
allowed-tools: Bash
---

## Restoring `$1` from shadow-history `$0`

```!
REF="$0"
P="$1"
if [ -z "$REF" ] || [ -z "$P" ]; then
  echo "history:restore — usage: /history:restore <ref> <path>" >&2
  echo "  example: /history:restore HEAD~5 src/auth.ts" >&2
  exit 0
fi
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" checkout "$REF" -- "$P"
echo "---"
echo "restored $P from $REF"
```

After running, print the bash block's output verbatim — no preamble. If restore succeeded, add one short line after the output reminding the user the workspace is now mutated and the next Stop hook will capture it as a new shadow commit. If it failed, surface the wrapper's error verbatim and stop — do not retry without the user's go-ahead.
