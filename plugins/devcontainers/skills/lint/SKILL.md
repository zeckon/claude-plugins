---
description: Review the active devcontainer config against a best-practices checklist (pinned versions, remoteUser, postCreate, secrets, ports, lifecycle, compose service field). Reports findings; does not auto-fix unless asked.
when_to_use: Use when the user says "lint my devcontainer", "review this config", or wants a sanity check before sharing the config.
allowed-tools: Read, Bash
---

# Lint the active devcontainer config

```!
{
  for f in .devcontainer/devcontainer.json .devcontainer.json; do
    [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; }
  done
  if [ -d .devcontainer ]; then
    for f in .devcontainer/*/devcontainer.json; do
      [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; }
    done
  fi
  for f in .devcontainer/Dockerfile Dockerfile.devcontainer; do
    [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; }
  done
} 2>&1
```

## Checklist

If no config was found, say so in one line and stop.

Otherwise evaluate each item below. Mark **OK / WARN / FAIL** and explain in one line if not OK. Do not auto-fix; if the user asks to fix in a follow-up, proceed then.

1. **Image / Dockerfile pinning** — `image` should pin a major tag (`:1`, `:1-3.12`), never `:latest` or no tag. Dockerfile `FROM` similarly.
2. **Feature versions pinned** — every key in `features` should end in `:N` (a tag). WARN if any are unpinned or use `:latest`.
3. **`remoteUser`** — set explicitly (most MS images expect `vscode`, `node`, etc.). FAIL if missing.
4. **Project install in `postCreateCommand`** — the project's own package install (npm/pip/etc.) belongs in `postCreateCommand`, not baked into a Dockerfile RUN. WARN if a Dockerfile is present and contains an install command for the project.
5. **`forwardPorts`** — declare ports the project listens on. WARN if the project has obvious framework signals (Next.js, Django, Rails, Vite) but no ports are declared.
6. **Plaintext secrets** — `containerEnv` / `remoteEnv` should not contain values that look like secrets (API keys, tokens, passwords matching common shapes). FAIL if found, suggest `secrets` or sourcing from a secret manager.
7. **Mounts** — every entry in `mounts` should be intentional and have a clear source. WARN on host-path mounts to non-workspace dirs.
8. **Lifecycle commands** — `postCreateCommand` should exist for any non-trivial project. WARN if missing.
9. **Compose: `service` field** — for `dockerComposeFile` configs declaring more than one service, the `service` field (which Claude attaches to) must be set. FAIL if missing.
10. **Compose: shared workspace mounts** — if multiple services bind-mount the same workspace, that's worth flagging as "is this intentional?". WARN.

## Output

Numbered list, each item one line for the verdict and at most one line of explanation. End with a single-line tally (e.g. `2 FAIL, 1 WARN, 7 OK`). If everything is OK, say so in one line.
