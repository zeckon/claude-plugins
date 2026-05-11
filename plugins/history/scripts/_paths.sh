# Sourced helper. Resolves the shadow-history bare repo path for the current
# $PWD and provides registry helpers for the opt-in enable/disable flow.
#
# Storage layout:
#   $HOME/.claude-history/<basename>-<6-char sha1 of abs path>.git
#   $HOME/.claude-history/enabled-paths    — newline-separated workspaces
#                                            opted into history capture
HISTORY_DIR="$HOME/.claude-history"
PROJECT=$(basename "$PWD")
HASH=$(printf '%s' "$PWD" | shasum | cut -c1-6)
GIT_DIR="$HISTORY_DIR/$PROJECT-$HASH.git"
REGISTRY_FILE="$HISTORY_DIR/enabled-paths"

# Returns 0 if $PWD is opted in, 1 otherwise.
history_is_enabled() {
  [ -f "$REGISTRY_FILE" ] || return 1
  grep -Fxq "$PWD" "$REGISTRY_FILE"
}

# Add $PWD to the registry. Idempotent.
history_enable_pwd() {
  mkdir -p "$HISTORY_DIR"
  if [ -f "$REGISTRY_FILE" ] && grep -Fxq "$PWD" "$REGISTRY_FILE"; then
    return 0
  fi
  printf '%s\n' "$PWD" >> "$REGISTRY_FILE"
}

# Remove $PWD from the registry. Idempotent.
history_disable_pwd() {
  [ -f "$REGISTRY_FILE" ] || return 0
  local tmp="$REGISTRY_FILE.tmp"
  grep -Fxv "$PWD" "$REGISTRY_FILE" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$REGISTRY_FILE"
}

# Initialize the shadow bare repo at $GIT_DIR if it doesn't exist. Idempotent.
history_init_repo() {
  mkdir -p "$HISTORY_DIR"
  [ -d "$GIT_DIR" ] && return 0
  git init --bare --quiet "$GIT_DIR"
  cat > "$GIT_DIR/info/exclude" <<'EOF'
.env
.env.*
node_modules/
dist/
build/
.DS_Store
*.log
.git/
EOF
  printf '%s\n' "$PWD" > "$GIT_DIR/.workspace-path"
}

# Remote-sync helpers. All read state directly from the bare repo's git
# config (or `git remote`), so there's no sidecar file to keep in sync. Each
# is a no-op-safe wrapper that tolerates a missing repo.

# Print the configured `origin` URL or empty string. Always exits 0.
history_remote_url() {
  [ -d "$GIT_DIR" ] || return 0
  git --git-dir="$GIT_DIR" remote get-url origin 2>/dev/null || true
}

# 0 if auto-push is on for this shadow repo, 1 otherwise.
history_auto_push_enabled() {
  [ -d "$GIT_DIR" ] || return 1
  [ "$(git --git-dir="$GIT_DIR" config --bool history.auto-push 2>/dev/null)" = "true" ]
}

# 0 if the user has acknowledged the privacy gate for this shadow repo.
history_push_acked() {
  [ -d "$GIT_DIR" ] || return 1
  [ "$(git --git-dir="$GIT_DIR" config --bool history.push-acked 2>/dev/null)" = "true" ]
}

# Print the per-machine remote branch name, e.g. `host/laptop`. Branch-name
# rules: no spaces, no `..`, etc. — sanitize to [A-Za-z0-9._-]. Falls back to
# "host/unknown" if hostname is empty.
history_branch_for_host() {
  local h
  h=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo "")
  h=$(printf '%s' "$h" | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//;s/-*$//')
  [ -z "$h" ] && h="unknown"
  printf 'host/%s\n' "$h"
}

# Path the detached background push writes its stdout/stderr to. One file per
# shadow repo; truncated each time the hook fires so we keep only the last
# attempt's output.
history_push_log_path() {
  printf '%s\n' "$GIT_DIR/push.log"
}
