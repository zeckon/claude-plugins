# Test helpers for devcontainers plugin.
# Sourced by tests/run-tests.sh inside a per-test subshell. Each test gets a
# fresh isolated $HOME and workspace dir, plus a controllable $PATH stub dir.

# Set up an isolated HOME, workspace dir, and stub-bin dir; cd into the
# workspace; restrict $PATH to a minimal allowlist + the stub dir.
setup_test_env() {
  TEST_HOME=$(mktemp -d -t dc-test-XXXXXXXX)
  TEST_WORKSPACE="$TEST_HOME/workspace"
  STUB_BIN="$TEST_HOME/stub-bin"
  mkdir -p "$TEST_WORKSPACE" "$STUB_BIN"
  export HOME="$TEST_HOME"
  cd "$TEST_WORKSPACE"
  # Restrict PATH so tests can decide which tools are "installed" by adding
  # stubs to $STUB_BIN. Keep /usr/bin and /bin so coreutils (cat, grep, etc.)
  # work, but nothing the plugin probes (devcontainer, npx, docker, npm).
  export PATH="$STUB_BIN:/usr/bin:/bin"
  trap 'rm -rf "$TEST_HOME"' EXIT
}

# Add a stub binary that prints a fixed string and returns a fixed exit code.
# Usage: stub_bin <name> [stdout-text] [exit-code]
stub_bin() {
  local name="$1"
  local out="${2:-}"
  local rc="${3:-0}"
  cat > "$STUB_BIN/$name" <<EOF
#!/usr/bin/env bash
printf '%s' "$out"
exit $rc
EOF
  chmod +x "$STUB_BIN/$name"
}

# Add a stub binary that records its arguments to $STUB_BIN/<name>.log and
# returns 0. The stub reads stdin to /dev/null so callers can pipe to it.
# Optionally emits canned stdout for specific argv patterns.
# Usage: stub_recorder <name>
stub_recorder() {
  local name="$1"
  cat > "$STUB_BIN/$name" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/$name.log"
exit 0
EOF
  chmod +x "$STUB_BIN/$name"
}

# Add a stub `devcontainer` that, when called with `read-configuration ...`,
# emits the JSON in the file at \$1; otherwise records args and returns 0.
# Usage: stub_devcontainer_with_config <path-to-json-file>
stub_devcontainer_with_config() {
  local cfg_file="$1"
  cat > "$STUB_BIN/devcontainer" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/devcontainer.log"
if [ "\$1" = "read-configuration" ]; then
  cat "$cfg_file"
fi
exit 0
EOF
  chmod +x "$STUB_BIN/devcontainer"
}

# Read the recorded argv lines for a given stub.
stub_log() {
  local name="$1"
  if [ -f "$STUB_BIN/$name.log" ]; then
    cat "$STUB_BIN/$name.log"
  fi
}

# Compute the per-workspace devcontainers state dir for the given path
# (defaults to $PWD). Mirrors plugins/devcontainers/scripts/_paths.sh.
dc_state_dir() {
  local p="${1:-$PWD}"
  local h
  h=$(printf '%s' "$p" | shasum | cut -c1-6)
  echo "$HOME/.claude-devcontainers/$(basename "$p")-$h"
}

# --- Assertions ---
# On failure each prints a descriptive message and `exit 1` to abort the test
# subshell — `return 1` is unreliable because bash 3.2's `set -e` doesn't
# propagate non-zero returns out of nested function calls.

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

assert_eq_rc() {
  local expected="$1" actual="$2" msg="${3:-exit code}"
  if [ "$expected" -ne "$actual" ]; then
    echo "FAIL ($msg): expected exit $expected, got $actual"
    exit 1
  fi
}
