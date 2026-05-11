# Tests for the autorebuild PostToolUse hook (scripts/hook-autorebuild.sh) and
# the autorebuild-on / autorebuild-off wrapper subcommands.
#
# The hook reads a PostToolUse event-JSON document on stdin. When auto-rebuild
# is enabled and the edited path matches a watched location, the hook invokes
# `bash $WRAPPER rebuild`. Tests stub the wrapper (via stubbing `devcontainer`,
# which `dc_run` invokes) and assert on whether/how the wrapper got called.

DC_BIN="$PLUGIN_DIR/bin/devcontainers"
HOOK="$PLUGIN_DIR/scripts/hook-autorebuild.sh"

# Build a PostToolUse event for the given tool + file_path.
mk_event() {
  local tool="$1" path="$2"
  jq -n --arg t "$tool" --arg p "$path" --arg cwd "$PWD" \
    '{hook_event_name:"PostToolUse", tool_name:$t, cwd:$cwd, tool_input:{file_path:$p}}'
}

# Run the hook with autorebuild enabled. CLAUDE_PLUGIN_ROOT is exported so the
# hook resolves $WRAPPER to the in-tree binary, and the devcontainer stub is
# what it invokes for the rebuild call. Returns the hook's stderr (where it
# logs progress) so callers can grep for "rebuilding because…".
run_hook_enabled() {
  local tool="$1" path="$2"
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"
  : > "$DC_STATE_DIR/autorebuild-enabled"
  local ev
  ev=$(mk_event "$tool" "$path")
  CLAUDE_PLUGIN_ROOT="$PLUGIN_DIR" bash "$HOOK" <<<"$ev" 2>&1
}

# A devcontainer stub that records `rebuild`-equivalent invocations to
# devcontainer.log. The wrapper's rebuild path calls
# `devcontainer up --remove-existing-container --workspace-folder .`.
stub_devcontainer_recorder() {
  cat > "$STUB_BIN/devcontainer" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/devcontainer.log"
exit 0
EOF
  chmod +x "$STUB_BIN/devcontainer"
}

# --- Disabled / no-op cases ---

test_hook_noop_when_disabled() {
  stub_devcontainer_recorder
  ev=$(mk_event "Edit" "$PWD/.devcontainer/devcontainer.json")
  out=$(printf '%s' "$ev" | bash "$HOOK" 2>&1)
  assert_eq "" "$out" "no rebuild when autorebuild-enabled flag absent"
  log=$(stub_log devcontainer)
  assert_eq "" "$log" "wrapper not invoked"
}

test_hook_noop_for_non_edit_tool() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"; : > "$DC_STATE_DIR/autorebuild-enabled"
  stub_devcontainer_recorder
  ev=$(jq -n --arg p "$PWD/.devcontainer/devcontainer.json" \
    '{hook_event_name:"PostToolUse", tool_name:"Read", tool_input:{file_path:$p}}')
  out=$(printf '%s' "$ev" | bash "$HOOK" 2>&1)
  assert_eq "" "$out" "Read tool does not trigger rebuild"
  log=$(stub_log devcontainer)
  assert_eq "" "$log" "wrapper not invoked"
}

test_hook_noop_for_unwatched_path() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Edit" "$PWD/src/index.ts")
  assert_eq "" "$out" "Edit on src/ does not trigger rebuild"
  # The hook *may* invoke `read-configuration` to enumerate compose files for
  # path matching — that's fine. We just need to confirm the rebuild itself
  # didn't fire.
  log=$(stub_log devcontainer)
  assert_not_contains "$log" "up --remove-existing-container" "rebuild not invoked"
}

test_hook_noop_when_file_path_missing() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"; : > "$DC_STATE_DIR/autorebuild-enabled"
  stub_devcontainer_recorder
  ev=$(jq -n '{hook_event_name:"PostToolUse", tool_name:"Edit", tool_input:{}}')
  out=$(printf '%s' "$ev" | bash "$HOOK" 2>&1)
  assert_eq "" "$out" "missing file_path is silently skipped"
}

# --- Watched paths trigger rebuild ---

test_hook_triggers_on_devcontainer_json() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Edit" "$PWD/.devcontainer/devcontainer.json")
  assert_contains "$out" "rebuilding because" "progress message"
  assert_contains "$out" ".devcontainer/devcontainer.json" "names the changed file"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container --workspace-folder ." "wrapper invoked rebuild"
}

test_hook_triggers_on_root_devcontainer_json() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Edit" "$PWD/.devcontainer.json")
  assert_contains "$out" "rebuilding because" "progress message"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked"
}

test_hook_triggers_on_dockerfile_in_devcontainer_dir() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Write" "$PWD/.devcontainer/Dockerfile")
  assert_contains "$out" "rebuilding because" "progress message"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked"
}

test_hook_triggers_on_compose_in_devcontainer_dir() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Edit" "$PWD/.devcontainer/docker-compose.yml")
  assert_contains "$out" "rebuilding because" "progress message"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked"
}

test_hook_triggers_on_named_subdir_devcontainer_json() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "Edit" "$PWD/.devcontainer/myenv/devcontainer.json")
  assert_contains "$out" "rebuilding because" "progress message for named-subdir form"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked rebuild"
}

test_hook_triggers_on_multiedit() {
  stub_devcontainer_recorder
  out=$(run_hook_enabled "MultiEdit" "$PWD/.devcontainer/devcontainer.json")
  assert_contains "$out" "rebuilding because" "MultiEdit also triggers"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked"
}

# --- Compose-file outside .devcontainer/ ---

test_hook_triggers_on_referenced_compose_file_outside_dot_devcontainer() {
  # Top-level docker-compose.yml referenced by .devcontainer/devcontainer.json's
  # dockerComposeFile. The hook should detect it via dc_compose_files and
  # rebuild. dc_read_config calls `devcontainer read-configuration` so we need
  # a richer stub here that handles both `read-configuration` (returns config
  # JSON) and the rebuild path (records the invocation).
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{ "dockerComposeFile": "../docker-compose.yml", "service": "app" }
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "configuration": {
    "dockerComposeFile": "../docker-compose.yml",
    "service": "app"
  },
  "mergedConfiguration": {
    "dockerComposeFile": ["../docker-compose.yml"],
    "service": "app"
  }
}
EOF
  cat > "$STUB_BIN/devcontainer" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/devcontainer.log"
if [ "\$1" = "read-configuration" ]; then
  cat "$TEST_HOME/merged-config.json"
fi
exit 0
EOF
  chmod +x "$STUB_BIN/devcontainer"
  # The compose path resolves to $PWD/docker-compose.yml (one level up from
  # .devcontainer/, which is the dir of devcontainer.json). Touch the file
  # so it exists; the hook only checks for path matching, not existence,
  # but realistic fixtures keep one foot on the ground.
  touch docker-compose.yml
  out=$(run_hook_enabled "Edit" "$PWD/docker-compose.yml")
  assert_contains "$out" "rebuilding because" "compose-file edit triggers rebuild"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked rebuild"
}

# Canonicalization: a tool_input.file_path that contains `..` segments must
# still match the .devcontainer/* prefix check after normalization.
test_hook_canonicalizes_dotdot_in_file_path() {
  stub_devcontainer_recorder
  # Construct a path with a redundant `.devcontainer/foo/../` segment that
  # normalizes back to `.devcontainer/devcontainer.json`. The hook should
  # resolve it via cd+pwd before the prefix check.
  mkdir -p .devcontainer/foo
  awkward="$PWD/.devcontainer/foo/../devcontainer.json"
  out=$(run_hook_enabled "Edit" "$awkward")
  assert_contains "$out" "rebuilding because" "trigger after dotdot normalization"
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container" "wrapper invoked"
}

# --- Rebuild failure surfaces clearly ---

test_hook_reports_rebuild_failure() {
  cat > "$STUB_BIN/devcontainer" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/devcontainer.log"
exit 17
EOF
  chmod +x "$STUB_BIN/devcontainer"
  out=$(run_hook_enabled "Edit" "$PWD/.devcontainer/devcontainer.json")
  assert_contains "$out" "rebuilding because" "still announces the rebuild attempt"
  assert_contains "$out" "rebuild failed" "failure message"
  assert_contains "$out" "/devcontainers:rebuild" "manual-retry hint"
}

# --- autorebuild-on / autorebuild-off subcommands ---

fixture_minimal_config() {
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  stub_bin devcontainer "" 0
}

test_autorebuild_on_creates_flag() {
  fixture_minimal_config
  out=$(bash "$DC_BIN" autorebuild-on 2>&1)
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_file_exists "$DC_STATE_DIR/autorebuild-enabled" "flag file"
  assert_contains "$out" "auto-rebuild enabled" "user-facing message"
}

test_autorebuild_on_refuses_without_config() {
  set +e
  out=$(bash "$DC_BIN" autorebuild-on 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no devcontainer.json" "missing-config message"
}

test_autorebuild_on_refuses_when_cli_missing() {
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  set +e
  out=$(bash "$DC_BIN" autorebuild-on 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no \`devcontainer\` CLI found" "CLI-missing message"
}

test_autorebuild_off_removes_flag() {
  fixture_minimal_config
  bash "$DC_BIN" autorebuild-on >/dev/null 2>&1
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_file_exists "$DC_STATE_DIR/autorebuild-enabled" "precondition: flag exists"
  out=$(bash "$DC_BIN" autorebuild-off 2>&1)
  assert_contains "$out" "auto-rebuild disabled" "off message"
  if [ -f "$DC_STATE_DIR/autorebuild-enabled" ]; then
    echo "FAIL: autorebuild-enabled should be removed"; exit 1
  fi
}

test_autorebuild_off_idempotent() {
  out=$(bash "$DC_BIN" autorebuild-off 2>&1)
  assert_contains "$out" "auto-rebuild already off" "idempotent off message"
}

test_autorebuild_on_rejects_unexpected_args() {
  fixture_minimal_config
  set +e
  out=$(bash "$DC_BIN" autorebuild-on extra-junk 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "unexpected argument" "rejection"
}
