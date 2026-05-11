---
description: List pinned features in the active devcontainer config and report current vs latest published versions. With --apply, edit the file to bump tags and emit a summary diff.
when_to_use: Use when the user says "upgrade devcontainer features", "are my features up to date", or wants to bump pinned feature versions.
argument-hint: "[--apply]"
allowed-tools: Read, Edit, Bash, WebFetch
---

# Upgrade pinned features

```!
{
  for f in .devcontainer/devcontainer.json .devcontainer.json; do
    [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; break; }
  done
  if [ -d .devcontainer ]; then
    for f in .devcontainer/*/devcontainer.json; do
      [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; }
    done
  fi
} 2>&1
```

## Steps

1. If no config was found, say so in one line and stop.
2. Parse the `features` object. For each entry, extract the OCI ref and current tag (e.g. `ghcr.io/devcontainers/features/node:1`).
3. For each feature, look up the latest published version. For `ghcr.io/devcontainers/features/<name>` (the official set), use WebFetch on:

   ```
   https://raw.githubusercontent.com/devcontainers/features/main/src/<name>/devcontainer-feature.json
   ```

   The `version` field there is the latest published version. Compare against the current tag — note that the tag and the `version` aren't always identical (the tag often pins major; `version` is the full semver), but a major-tag mismatch (e.g. tag `:1` while `version` is `2.x.x`) signals a breaking-change major bump.

   For non-`ghcr.io/devcontainers/features` refs, skip with a note ("third-party feature; manual check required").

4. Report results as a table:

   | Feature | Current tag | Latest version | Action |
   |---|---|---|---|
   | node | `:1` | `1.6.2` | up to date |
   | python | `:1` | `2.0.0` | **major bump available** |

5. If `$0` is `--apply`:
   - For each feature where a non-major bump is available, edit the config to update the tag.
   - Skip features with major bumps unless the user re-runs and confirms — major bumps may have breaking changes.
   - Print a unified diff of the resulting changes and one line per skipped major bump.

6. If no features section exists, say so in one line and stop.

## Notes

- Don't fetch tags from the OCI registry directly — it requires auth.
- WebFetch is rate-limited; if multiple features fail to fetch, report what was learned and stop rather than retrying indefinitely.
- The user may want to override the tag with the feature's *option* (e.g. `"version": "20"` to pick Node 20). That's outside the scope of this skill — point them at `/devcontainers:add-feature` or direct edit if they ask.
