---
description: Disable sandbox mode for the current workspace. Claude's Bash invocations resume running directly on the host.
when_to_use: Use when the user says "turn off sandbox", "stop running claude inside the container", "exit sandbox", or wants Bash to behave normally again.
allowed-tools: Bash
---

```!
bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" sandbox-off
```
