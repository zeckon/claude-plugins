# Auto-rebuild

When auto-rebuild is enabled for a workspace (`/devcontainers:autorebuild-on`), the plugin's `PostToolUse` hook fires after every successful `Edit` / `Write` / `MultiEdit`. If the edited path matches a watched location, the hook runs `bash <plugin-root>/bin/devcontainers rebuild` synchronously (foreground) so progress and any failure surface inline.

Auto-rebuild is per-workspace and off by default. `/devcontainers:autorebuild-off` stops watching.

## Watched paths

- `<workspace>/.devcontainer/devcontainer.json`
- `<workspace>/.devcontainer.json`
- Anything else under `<workspace>/.devcontainer/` (Dockerfile, compose, scripts the config references)
- Compose files declared in the active config's `dockerComposeFile` field — including those *outside* `.devcontainer/` (e.g. a top-level `docker-compose.yml`). Paths are canonicalized so `../docker-compose.yml` references resolve correctly against actual edited paths.

## Caveats

- **Synchronous and slow.** Rebuilds typically take 30s–5min and block Claude's next turn. For rapid successive config edits, run `/devcontainers:autorebuild-off`, finish editing, then `/devcontainers:rebuild` once at the end.
- **No debouncing.** Multiple watched edits in a row fire multiple rebuilds. v2 concern.
- **Single-service rebuild only.** The hook calls `rebuild` without `--service`, which recreates the primary container. For compose configs where you edited a *sibling* Dockerfile, the primary's image changes won't propagate — run `/devcontainers:rebuild --service <name>` manually after the autorebuild lands.
- **Hook fails open.** Any internal error (missing `jq`, malformed event JSON, broken config the CLI rejects) → the hook exits 0 with no rebuild. Better to skip a rebuild than break Edit/Write across an entire session.
- **Symlinked workspaces are partially handled.** `..`/`.` segments are normalized, but if your workspace is reached via a symlink (`/Users/me/work` → `/Volumes/Data/work`) and Claude's `Edit`/`Write` delivers the canonical form, the hook's prefix check may miss. Workaround: `cd` to the realpath form before launching Claude. Tracked for a future fix.
