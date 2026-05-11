# Sourced helper. Resolves the per-workspace state directory for the
# devcontainers plugin and provides locators for the active config file.
#
# Storage layout:
#   $HOME/.claude-devcontainers/<basename>-<6-char sha1 of abs path>/
#     sandbox-enabled     — presence-based flag (Phase 3)
#     sandbox-service     — optional override of the target service (Phase 3)
#     autorebuild-enabled — presence-based flag (Phase 4)
#     workspace-root      — absolute path of the workspace this id belongs to
DEVCONTAINERS_DIR="$HOME/.claude-devcontainers"
DC_PROJECT=$(basename "$PWD")
DC_HASH=$(printf '%s' "$PWD" | shasum | cut -c1-6)
DC_STATE_DIR="$DEVCONTAINERS_DIR/$DC_PROJECT-$DC_HASH"

# Create $DC_STATE_DIR if needed and stamp the workspace path. Idempotent.
dc_init_state_dir() {
  mkdir -p "$DC_STATE_DIR"
  printf '%s\n' "$PWD" > "$DC_STATE_DIR/workspace-root"
}

# Print the path to the active devcontainer config in $PWD, or empty if none.
# Lookup order matches the devcontainer CLI:
#   .devcontainer/devcontainer.json
#   .devcontainer.json
#   .devcontainer/<name>/devcontainer.json   (first one found, alphabetical)
dc_find_config() {
  if [ -f "$PWD/.devcontainer/devcontainer.json" ]; then
    printf '%s\n' "$PWD/.devcontainer/devcontainer.json"
    return 0
  fi
  if [ -f "$PWD/.devcontainer.json" ]; then
    printf '%s\n' "$PWD/.devcontainer.json"
    return 0
  fi
  if [ -d "$PWD/.devcontainer" ]; then
    local f
    for f in "$PWD/.devcontainer"/*/devcontainer.json; do
      [ -f "$f" ] || continue
      printf '%s\n' "$f"
      return 0
    done
  fi
  return 1
}

# 0 if a devcontainer config exists, 1 otherwise.
dc_has_config() {
  dc_find_config >/dev/null
}
