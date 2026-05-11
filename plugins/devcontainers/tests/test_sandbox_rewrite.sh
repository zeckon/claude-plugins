# Tests for the sandbox PreToolUse hook (scripts/hook-sandbox.sh) and the
# sandbox-on / sandbox-off wrapper subcommands.
#
# The hook reads an event-JSON document on stdin and emits an empty stdout
# (no rewrite) or a hookSpecificOutput JSON (rewrite). Tests construct event
# JSON, pipe it to the hook, and assert on stdout.

DC_BIN="$PLUGIN_DIR/bin/devcontainers"
HOOK="$PLUGIN_DIR/scripts/hook-sandbox.sh"

# Build a minimal Bash-tool PreToolUse event with the given command.
mk_event() {
  local cmd="$1"
  jq -n --arg c "$cmd" --arg cwd "$PWD" \
    '{hook_event_name:"PreToolUse", tool_name:"Bash", cwd:$cwd, tool_input:{command:$c}}'
}

# Run the hook with sandbox enabled in $DC_STATE_DIR. Pipes the event to it
# and prints stdout. CLAUDE_PLUGIN_ROOT is exported so the hook process inherits
# it (it controls both the rewrite-target path and the bash-allowlist check).
run_hook_enabled() {
  local cmd="$1"
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"
  : > "$DC_STATE_DIR/sandbox-enabled"
  local ev
  ev=$(mk_event "$cmd")
  CLAUDE_PLUGIN_ROOT="$PLUGIN_DIR" bash "$HOOK" <<<"$ev"
}

# --- Sandbox off / no-op cases ---

test_hook_noop_when_disabled() {
  out=$(mk_event "hostname" | bash "$HOOK")
  assert_eq "" "$out" "no rewrite when sandbox-enabled flag absent"
}

test_hook_noop_for_non_bash_tool() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"; : > "$DC_STATE_DIR/sandbox-enabled"
  ev=$(jq -n '{hook_event_name:"PreToolUse", tool_name:"Read", tool_input:{file_path:"/etc/hostname"}}')
  out=$(printf '%s' "$ev" | bash "$HOOK")
  assert_eq "" "$out" "non-Bash tools are untouched"
}

test_hook_noop_when_command_empty() {
  out=$(run_hook_enabled "")
  assert_eq "" "$out" "empty command is not rewritten"
}

# --- Allowlist ---

test_hook_allows_git() {
  out=$(run_hook_enabled "git status")
  assert_eq "" "$out" "git stays on host"
}

test_hook_allows_gh() {
  out=$(run_hook_enabled "gh pr list")
  assert_eq "" "$out" "gh stays on host"
}

test_hook_allows_docker() {
  out=$(run_hook_enabled "docker ps")
  assert_eq "" "$out" "docker stays on host"
}

test_hook_allows_devcontainer() {
  out=$(run_hook_enabled "devcontainer up --workspace-folder .")
  assert_eq "" "$out" "devcontainer stays on host"
}

test_hook_allows_cd_pwd_ls() {
  for c in "cd /tmp" "pwd" "ls -la"; do
    out=$(run_hook_enabled "$c")
    assert_eq "" "$out" "host: $c"
  done
}

# --- bash / npx conditional allowlist ---

test_hook_allows_bash_invoking_plugin_root() {
  out=$(run_hook_enabled "bash \"$PLUGIN_DIR/bin/devcontainers\" doctor")
  assert_eq "" "$out" "bash <plugin-root>/... stays on host (avoids re-routing skill calls)"
}

test_hook_rewrites_bash_invoking_other_path() {
  out=$(run_hook_enabled "bash /tmp/random.sh")
  assert_contains "$out" "hookSpecificOutput" "bash with non-plugin path is sandboxed"
  assert_contains "$out" "updatedInput" "rewrite output present"
}

test_hook_allows_npx_devcontainers_cli() {
  out=$(run_hook_enabled "npx -y @devcontainers/cli up --workspace-folder .")
  assert_eq "" "$out" "npx @devcontainers/cli stays on host"
}

test_hook_rewrites_npx_other_package() {
  out=$(run_hook_enabled "npx some-other-package")
  assert_contains "$out" "hookSpecificOutput" "npx of arbitrary package is sandboxed"
}

# --- Rewrite shape ---

test_hook_rewrites_simple_command() {
  out=$(run_hook_enabled "hostname")
  # Decision is allow + updatedInput.command wraps in `devcontainers exec ... bash -lc <quoted>`.
  decision=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision')
  evt=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.hookEventName')
  new_cmd=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.updatedInput.command')
  assert_eq "allow" "$decision" "permissionDecision"
  assert_eq "PreToolUse" "$evt" "hookEventName"
  assert_contains "$new_cmd" "$PLUGIN_DIR/bin/devcontainers exec" "wrapper invocation"
  assert_contains "$new_cmd" "bash -lc" "wraps in bash -lc"
  assert_contains "$new_cmd" "hostname" "preserves original command"
  assert_not_contains "$new_cmd" "--service" "no --service when sandbox-service unset"
}

test_hook_rewrites_with_service() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"
  : > "$DC_STATE_DIR/sandbox-enabled"
  printf 'db\n' > "$DC_STATE_DIR/sandbox-service"
  ev=$(mk_event "psql -U postgres")
  out=$(CLAUDE_PLUGIN_ROOT="$PLUGIN_DIR" bash "$HOOK" <<<"$ev")
  new_cmd=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.updatedInput.command')
  assert_contains "$new_cmd" "exec --service db --" "service routing"
  assert_contains "$new_cmd" "psql" "preserves original command"
}

test_hook_quotes_wrapper_path_with_spaces() {
  # Plugin install paths can contain spaces (macOS users under
  # `~/Library/Application Support/...` etc). Without proper %q-quoting of
  # $WRAPPER, the rewritten command-line splits at the space and Claude
  # Code's Bash tool exec's the wrong path. This test rebuilds the rewritten
  # command via shell word-splitting and asserts argv[0] is the full wrapper
  # path with the space preserved.
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p "$DC_STATE_DIR"; : > "$DC_STATE_DIR/sandbox-enabled"
  fake_root="$TEST_HOME/My Plugins/devcontainers"
  ev=$(mk_event "hostname")
  out=$(CLAUDE_PLUGIN_ROOT="$fake_root" bash "$HOOK" <<<"$ev")
  new_cmd=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.updatedInput.command')
  # Tokenize via the same word-splitting bash will perform on the rewritten
  # command. eval is safe here — the hook produced this string, no untrusted
  # input reaches it.
  set --
  eval "set -- $new_cmd"
  assert_eq "$fake_root/bin/devcontainers" "$1" "wrapper path is one argv"
  assert_eq "exec" "$2" "exec subcommand follows wrapper"
  assert_eq "--" "$3" "delimiter follows exec"
  assert_eq "bash" "$4" "bash -lc follows delimiter"
  assert_eq "-lc" "$5" "lc flag"
  assert_eq "hostname" "$6" "original command preserved as single arg"
}

test_hook_preserves_multi_statement_command() {
  # Pipes, &&, redirects must round-trip through `bash -lc <quoted>`. We can't
  # actually execute the rewrite here (no docker), but we can verify every
  # distinctive token survives in the rewritten command's single-arg form.
  # First token (`make`) is intentionally not in the allowlist so we get a rewrite.
  orig='make build && echo done | head -5'
  out=$(run_hook_enabled "$orig")
  new_cmd=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.updatedInput.command')
  assert_contains "$new_cmd" "make" "make survives"
  assert_contains "$new_cmd" "build" "build survives"
  assert_contains "$new_cmd" "echo" "echo survives"
  assert_contains "$new_cmd" "head" "head survives"
}

# --- sandbox-on / sandbox-off subcommands ---

# Set up a workspace with an image-based devcontainer.json + stubs so
# `sandbox-on` passes its CLI/config checks without touching docker.
fixture_minimal_config() {
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  stub_bin devcontainer "" 0
}

test_sandbox_on_creates_flag() {
  fixture_minimal_config
  out=$(bash "$DC_BIN" sandbox-on 2>&1)
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_file_exists "$DC_STATE_DIR/sandbox-enabled" "flag file"
  assert_contains "$out" "sandbox enabled" "user-facing message"
  if [ -f "$DC_STATE_DIR/sandbox-service" ]; then
    echo "FAIL: sandbox-service should not exist when --service is omitted"
    exit 1
  fi
}

test_sandbox_on_with_service() {
  fixture_minimal_config
  out=$(bash "$DC_BIN" sandbox-on --service db 2>&1)
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_file_exists "$DC_STATE_DIR/sandbox-enabled" "flag file"
  assert_file_exists "$DC_STATE_DIR/sandbox-service" "service file"
  assert_eq "db" "$(cat "$DC_STATE_DIR/sandbox-service")" "service contents"
  assert_contains "$out" "service: db" "message mentions service"
}

test_sandbox_on_refuses_without_config() {
  set +e
  out=$(bash "$DC_BIN" sandbox-on 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no devcontainer.json" "missing-config message"
}

test_sandbox_on_refuses_when_cli_missing() {
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  # No `devcontainer` and no `npx` on PATH (helpers strip them by default).
  set +e
  out=$(bash "$DC_BIN" sandbox-on 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no \`devcontainer\` CLI found" "CLI-missing message"
}

test_sandbox_off_removes_flags() {
  fixture_minimal_config
  bash "$DC_BIN" sandbox-on --service db >/dev/null 2>&1
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_file_exists "$DC_STATE_DIR/sandbox-enabled" "precondition: flag exists"
  out=$(bash "$DC_BIN" sandbox-off 2>&1)
  assert_contains "$out" "sandbox disabled" "off message"
  if [ -f "$DC_STATE_DIR/sandbox-enabled" ]; then
    echo "FAIL: sandbox-enabled should be removed"; exit 1
  fi
  if [ -f "$DC_STATE_DIR/sandbox-service" ]; then
    echo "FAIL: sandbox-service should be removed"; exit 1
  fi
}

test_sandbox_off_idempotent() {
  out=$(bash "$DC_BIN" sandbox-off 2>&1)
  assert_contains "$out" "sandbox already off" "idempotent off message"
}
