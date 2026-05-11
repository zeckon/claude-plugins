---
description: Read the active devcontainer config (and referenced Dockerfile/compose) and produce a structured plain-English summary of the dev environment. For compose configs, enumerates all services and marks the primary.
when_to_use: Use when the user asks "explain this devcontainer", "what does my devcontainer set up", "what services does this run", or wants to understand a config they didn't write.
allowed-tools: Read, Bash
---

# Explain the active devcontainer config

```!
{
  echo "=== merged configuration (devcontainer CLI) ==="
  bash "${CLAUDE_PLUGIN_ROOT}/bin/devcontainers" cli read-configuration --workspace-folder . --include-merged-configuration 2>&1 | head -c 200000 || true
  echo
  echo "=== raw config files ==="
  for f in .devcontainer/devcontainer.json .devcontainer.json; do
    if [ -f "$f" ]; then
      echo "--- $f ---"
      cat "$f"
    fi
  done
  if [ -d .devcontainer ]; then
    for f in .devcontainer/*/devcontainer.json; do
      if [ -f "$f" ]; then
        echo "--- $f ---"
        cat "$f"
      fi
    done
  fi
} 2>&1
```

## How to summarize

If no config was found, say so in one line and stop.

Otherwise, structure the summary like:

- **Name & image**: the `name` field and the resolved base image (or `Dockerfile`/`dockerComposeFile` if used).
- **Services** (compose only): list every service from the compose file. Mark the primary (`service` field) with `(primary — Claude attaches here)`. If there's only one service or it's not a compose config, skip this section.
- **Features**: bulleted list, one line per feature with its tag and any non-default options.
- **Lifecycle**: `initializeCommand`, `onCreateCommand`, `updateContentCommand`, `postCreateCommand`, `postStartCommand`, `postAttachCommand` — list whichever are set.
- **Ports**: `forwardPorts` and `portsAttributes` if present.
- **User & workspace**: `remoteUser`, `containerUser`, `workspaceFolder`, `workspaceMount`.
- **Env**: `containerEnv` and `remoteEnv` keys (don't print values that look like secrets — say `<redacted>`).
- **Customizations**: VS Code extensions and settings if relevant.
- **Mounts**: `mounts` entries, each in plain English.

For compose configs, also Read the compose file referenced by `dockerComposeFile` to enumerate all services. The merged-configuration output above will identify which service is primary, but won't necessarily include the others.

If a `Dockerfile` is referenced, Read it and summarize what it does (base image, key RUN steps, entrypoint).

Keep the summary tight — one bullet per significant fact, not paragraphs.
