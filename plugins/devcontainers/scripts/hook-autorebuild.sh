#!/usr/bin/env bash
# PostToolUse hook for Edit/Write/MultiEdit. When auto-rebuild is enabled for
# the current workspace, edits to a devcontainer config file (or a file the
# config references) trigger `devcontainer up --remove-existing-container` so
# the running container picks up the change without a manual rebuild.
#
# Wire-up: hooks/hooks.json registers this script for matcher
# "^(Edit|Write|MultiEdit)$". Claude Code pipes the event JSON to stdin after
# a successful Edit/Write/MultiEdit. Per the hooks protocol, exit 0 with no
# output leaves the tool result alone; we use stderr for progress so the user
# sees rebuild output during the (potentially long) blocking call.
#
# Behavior:
#   1. Off when $DC_STATE_DIR/autorebuild-enabled is missing → exit 0 silently.
#   2. Only acts on Edit/Write/MultiEdit events with a file_path.
#   3. file_path matches one of:
#        - .devcontainer/devcontainer.json
#        - .devcontainer.json
#        - any file under .devcontainer/ (Dockerfile, compose, scripts)
#        - any compose file declared by the active config's dockerComposeFile
#      → run `<plugin-root>/bin/devcontainers rebuild`.
#   4. No match → exit 0 silently.
#
# Failure mode: any internal error → exit 0 with no rebuild. Better to skip a
# rebuild than to break Edit/Write across an entire session.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_paths.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/ensure-cli.sh"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_compose.sh"

# Off by default. Cheap stat before consuming stdin/jq — Edit/Write fire often.
[ -f "$DC_STATE_DIR/autorebuild-enabled" ] || exit 0

EVENT=$(cat 2>/dev/null || true)
[ -n "$EVENT" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME=$(printf '%s' "$EVENT" | jq -r '.tool_name // empty' 2>/dev/null)
case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

FILE_PATH=$(printf '%s' "$EVENT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$FILE_PATH" ] || exit 0

# Resolve to absolute. Edit/Write usually pass absolute paths but we don't
# rely on that — relative paths get joined to $PWD.
case "$FILE_PATH" in
  /*) ABS_PATH="$FILE_PATH" ;;
  *)  ABS_PATH="$PWD/$FILE_PATH" ;;
esac

# Normalize `..`/`.` segments in both ABS_PATH and $PWD before comparing.
# A `tool_input.file_path` of "/work/.devcontainer/../bar" or a $PWD that
# accumulated `./` prefixes won't match the prefix check otherwise. cd+pwd
# matches the form `dc_compose_files` produces so all comparisons go through
# the same canonicalization. (Symlinked workspaces are NOT fully handled —
# that needs `pwd -P` everywhere and a physical-path round-trip across
# `dc_compose_files`; tracked as future work.)
ABS_DIR=$(dirname "$ABS_PATH")
ABS_BASE=$(basename "$ABS_PATH")
if RESOLVED_DIR=$(cd "$ABS_DIR" 2>/dev/null && pwd); then
  ABS_PATH="$RESOLVED_DIR/$ABS_BASE"
fi
WORKSPACE=$(cd "$PWD" && pwd)

# Match the path against watched locations. Order matters only for performance:
# the path-prefix checks are O(1), the compose-file lookup invokes the CLI.
WATCHED=0

if [[ "$ABS_PATH" == "$WORKSPACE/.devcontainer/"* ]]; then
  # Anything under .devcontainer/ — covers devcontainer.json, named-config
  # subdirs, sibling Dockerfile/compose/scripts.
  WATCHED=1
elif [ "$ABS_PATH" = "$WORKSPACE/.devcontainer.json" ]; then
  WATCHED=1
else
  # Compose files declared in the active config that live outside .devcontainer/
  # (e.g. a top-level docker-compose.yml). Tolerate config-read failure — if
  # the config we just edited is malformed, we still want the simple-path
  # checks above to catch the .devcontainer/devcontainer.json case.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ "$ABS_PATH" = "$f" ]; then
      WATCHED=1
      break
    fi
  done < <(dc_compose_files 2>/dev/null || true)
fi

[ "$WATCHED" -eq 1 ] || exit 0

# Rebuild via the wrapper so it picks up the same dc_run / npx-fallback path
# the user-facing `/devcontainers:rebuild` skill uses. Foreground so the user
# sees progress and any failure inline.
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WRAPPER="$PLUGIN_ROOT/bin/devcontainers"

echo "devcontainers: rebuilding because $FILE_PATH changed…" >&2
if bash "$WRAPPER" rebuild >&2; then
  echo "devcontainers: rebuild complete." >&2
else
  echo "devcontainers: rebuild failed — fix the config and re-run /devcontainers:rebuild manually." >&2
fi
exit 0
