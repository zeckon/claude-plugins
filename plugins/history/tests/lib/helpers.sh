# Test helpers for history plugin.
# Sourced by tests/run-tests.sh inside a per-test subshell. Each test gets a
# fresh isolated $HOME and workspace dir, so tests cannot see real shadow repos
# and cannot leak state across tests.

# Set up an isolated HOME and workspace dir, cd into the workspace, configure
# git author env vars, and register cleanup on subshell exit.
setup_test_env() {
  TEST_HOME=$(mktemp -d -t history-test-XXXXXXXX)
  TEST_WORKSPACE="$TEST_HOME/workspace"
  mkdir -p "$TEST_WORKSPACE"
  export HOME="$TEST_HOME"
  cd "$TEST_WORKSPACE"
  export GIT_AUTHOR_NAME="Test User"
  export GIT_AUTHOR_EMAIL="test@test.local"
  export GIT_COMMITTER_NAME="Test User"
  export GIT_COMMITTER_EMAIL="test@test.local"
  trap 'rm -rf "$TEST_HOME"' EXIT
}

# Resolve the shadow-history bare-repo path for a given workspace dir
# (defaults to $PWD). Mirrors what plugins/history/scripts/_paths.sh computes.
shadow_dir() {
  local p="${1:-$PWD}"
  local h
  h=$(printf '%s' "$p" | shasum | cut -c1-6)
  echo "$HOME/.claude-history/$(basename "$p")-$h.git"
}

# Opt the current $PWD into the shadow-history registry. The hooks no-op
# unless the workspace is enabled, so any test exercising the happy path
# needs this. `run_init` calls it automatically.
enable_workspace() {
  mkdir -p "$HOME/.claude-history"
  local registry="$HOME/.claude-history/enabled-paths"
  if [ -f "$registry" ] && grep -Fxq "$PWD" "$registry"; then
    return 0
  fi
  printf '%s\n' "$PWD" >> "$registry"
}

# Remove the current $PWD from the registry (for testing the disabled path).
disable_workspace() {
  local registry="$HOME/.claude-history/enabled-paths"
  [ -f "$registry" ] || return 0
  local tmp="$registry.tmp"
  grep -Fxv "$PWD" "$registry" > "$tmp" 2>/dev/null || true
  mv "$tmp" "$registry"
}

# Convenience invokers for the hooks. Tests use simple ASCII session_ids and
# prompts so we don't have to JSON-escape. `run_init` auto-enables the
# workspace so callers don't have to repeat it; tests of the disabled path
# bypass these helpers and call the hook scripts directly.
run_init() {
  local session="$1" prompt="$2"
  enable_workspace
  echo "{\"session_id\":\"$session\",\"prompt\":\"$prompt\"}" \
    | bash "$PLUGIN_DIR/scripts/hook-init.sh"
}

run_commit() {
  local session="$1" transcript="${2:-}"
  if [ -n "$transcript" ]; then
    echo "{\"session_id\":\"$session\",\"transcript_path\":\"$transcript\"}" \
      | bash "$PLUGIN_DIR/scripts/hook-commit.sh"
  else
    echo "{\"session_id\":\"$session\"}" \
      | bash "$PLUGIN_DIR/scripts/hook-commit.sh"
  fi
}

# Write a synthetic Claude Code session transcript to the location
# show-transcript.py looks for: ~/.claude/projects/<encoded-cwd>/<session>.jsonl.
# Caller pipes JSONL content via stdin. Echoes the file path on stdout so
# tests can pass it to run_commit.
make_transcript() {
  local session="$1" workspace="${2:-$PWD}"
  local encoded
  encoded=$(printf '%s' "$workspace" | tr '/' '-')
  local proj_dir="$HOME/.claude/projects/$encoded"
  mkdir -p "$proj_dir"
  local path="$proj_dir/$session.jsonl"
  cat > "$path"
  echo "$path"
}

# Assertions. On failure each prints a descriptive message and `exit 1` to
# abort the test subshell — `return 1` is unreliable because bash 3.2's
# `set -e` does not propagate non-zero returns out of nested function calls,
# so a failing assertion would be silently swallowed by the runner.

assert_eq() {
  local expected="$1" actual="$2" msg="${3:-values}"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL ($msg): expected [$expected], got [$actual]"
    exit 1
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="${3:-output}"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL ($msg): expected to contain [$needle]"
    echo "  actual: $haystack"
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1" needle="$2" msg="${3:-output}"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "FAIL ($msg): expected to NOT contain [$needle]"
    echo "  actual: $haystack"
    exit 1
  fi
}

assert_file_exists() {
  local path="$1" msg="${2:-file}"
  if [ ! -f "$path" ]; then
    echo "FAIL ($msg): expected file [$path]"
    exit 1
  fi
}

assert_dir_exists() {
  local path="$1" msg="${2:-dir}"
  if [ ! -d "$path" ]; then
    echo "FAIL ($msg): expected dir [$path]"
    exit 1
  fi
}

assert_dir_missing() {
  local path="$1" msg="${2:-dir}"
  if [ -d "$path" ]; then
    echo "FAIL ($msg): expected dir [$path] to be missing"
    exit 1
  fi
}

assert_fails() {
  local msg="${1:-command}"; shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL ($msg): expected command to fail, but it succeeded: $*"
    exit 1
  fi
}
