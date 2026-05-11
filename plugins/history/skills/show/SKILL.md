---
description: Show the prompt and full diff for a specific past Claude turn (a shadow-history commit).
when_to_use: Use when the user asks "what did turn X do", "show me commit <sha>", or refers to a specific past prompt by ref.
argument-hint: "<ref>"
allowed-tools: Bash
---

## Shadow-history commit `$0`

```!
REF="$0"
if [ -z "$REF" ]; then
  echo "history:show — usage: /history:show <ref>   (e.g. HEAD, HEAD~3, <sha>)" >&2
  exit 0
fi
bash "${CLAUDE_PLUGIN_ROOT}/bin/history" show --no-color --stat "$REF" 2>&1 | head -c 200000
```

After running, print the bash block's output verbatim — no preamble or summary. Exception: if the ref was invalid, the diff was truncated mid-hunk, or the commit was empty, add at most one short sentence after the output flagging that.
