# Sourced helper. Compose-aware helpers for the devcontainers plugin. Reads
# the merged config via `devcontainer read-configuration` and exposes:
#   dc_read_config       — print the merged-configuration JSON; exit 1 if absent
#   dc_primary_service   — print .service or empty
#   dc_compose_files     — print absolute paths of dockerComposeFile entries,
#                          one per line; empty if not a compose config
#   dc_compose_project   — print the docker-compose project name of the
#                          running devcontainer for $PWD, or empty if none
#
# Requires _paths.sh and ensure-cli.sh to be sourced first.

# Print the merged configuration JSON to stdout. Returns 1 if the CLI fails or
# no config is present. Tests stub `devcontainer` to return canned JSON. The
# CLI logs to stderr by default, so suppressing 2>&1 keeps the JSON clean
# without needing an explicit --log-level flag (which not every CLI version
# supports).
dc_read_config() {
  dc_run read-configuration --workspace-folder . --include-merged-configuration 2>/dev/null
}

# Print the primary service from .mergedConfiguration.service (falling back to
# .configuration.service). Empty string if not a compose config or absent.
dc_primary_service() {
  local cfg
  cfg=$(dc_read_config) || return 0
  printf '%s' "$cfg" | jq -r '.mergedConfiguration.service // .configuration.service // empty' 2>/dev/null
}

# Print absolute, canonicalized paths of dockerComposeFile entries, one per
# line. Resolves relative paths against the directory containing the active
# devcontainer config file (per the spec) and collapses `.` / `..` segments
# so callers can do byte-equal comparisons against other absolute paths
# (the autorebuild hook needs this when matching tool_input.file_path).
# Empty output for non-compose configs.
dc_compose_files() {
  local cfg cfg_path cfg_dir
  cfg=$(dc_read_config) || return 0
  cfg_path=$(dc_find_config) || return 0
  cfg_dir=$(dirname "$cfg_path")
  printf '%s' "$cfg" \
    | jq -r '(.mergedConfiguration.dockerComposeFile // .configuration.dockerComposeFile // empty)
              | if type == "array" then .[] else . end' 2>/dev/null \
    | while IFS= read -r f; do
        [ -z "$f" ] && continue
        local target_dir target_base resolved
        if [[ "$f" = /* ]]; then
          target_dir=$(dirname "$f")
          target_base=$(basename "$f")
        else
          target_dir="$cfg_dir/$(dirname "$f")"
          target_base=$(basename "$f")
        fi
        # Use cd+pwd to canonicalize (resolves .. / . / symlinks). Falls back
        # to the unresolved form if the parent dir doesn't exist yet — better
        # to emit something than nothing, even if comparisons may miss.
        if resolved=$(cd "$target_dir" 2>/dev/null && pwd); then
          printf '%s/%s\n' "$resolved" "$target_base"
        else
          printf '%s/%s\n' "$target_dir" "$target_base"
        fi
      done
}

# Print the docker-compose project name of the running devcontainer for the
# current $PWD. The @devcontainers/cli labels every container it starts with
# `devcontainer.local_folder=<absolute workspace path>`. We find one such
# container and read its `com.docker.compose.project` label — that's the
# project name compose used, which we need to pass via -p so subsequent
# `docker compose` calls land in the same namespace (otherwise compose
# computes a different default and we'd be talking to the wrong/missing
# containers).
#
# Empty stdout + return 1 if no matching container is running. Callers should
# treat that as "user needs to run /devcontainers:up first".
dc_compose_project() {
  command -v docker >/dev/null 2>&1 || return 1
  local id
  id=$(docker ps -q --filter "label=devcontainer.local_folder=$PWD" 2>/dev/null | head -1)
  # Fallback for symlinked workspaces: if $PWD is a symlink, the CLI may have
  # labeled the container with the resolved path. Try realpath before giving
  # up. Cheap; no-op when paths already match.
  if [ -z "$id" ] && command -v realpath >/dev/null 2>&1; then
    local resolved
    resolved=$(realpath "$PWD" 2>/dev/null) || resolved=""
    if [ -n "$resolved" ] && [ "$resolved" != "$PWD" ]; then
      id=$(docker ps -q --filter "label=devcontainer.local_folder=$resolved" 2>/dev/null | head -1)
    fi
  fi
  [ -z "$id" ] && return 1
  local proj
  proj=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$id" 2>/dev/null)
  [ -z "$proj" ] && return 1
  printf '%s\n' "$proj"
}
