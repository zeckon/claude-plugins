# Tests for the opt-in flow: registry guard in hooks, plus the enable /
# disable / status subcommands of bin/history.

# --- guard behavior ---------------------------------------------------------

test_init_no_op_when_not_enabled() {
  echo '{"session_id":"s","prompt":"hi"}' \
    | bash "$PLUGIN_DIR/scripts/hook-init.sh"
  assert_dir_missing "$(shadow_dir)" "init does not create repo when not enabled"
}

test_commit_no_op_when_not_enabled() {
  # Even if a repo somehow already exists, commit should bail when registry
  # doesn't list this workspace.
  mkdir -p "$HOME/.claude-history"
  git init --bare --quiet "$(shadow_dir)"
  echo "v1" > file.txt
  echo '{"session_id":"s"}' \
    | bash "$PLUGIN_DIR/scripts/hook-commit.sh"
  local count
  count=$(git --git-dir="$(shadow_dir)" rev-list --count HEAD 2>/dev/null || echo 0)
  assert_eq "0" "$count" "no commit recorded when not enabled"
}

# --- enable -----------------------------------------------------------------

test_enable_registers_pwd_and_creates_repo() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  assert_file_exists "$HOME/.claude-history/enabled-paths" "registry created"
  local registry
  registry=$(cat "$HOME/.claude-history/enabled-paths")
  assert_eq "$PWD" "$registry" "registry lists $PWD"
  assert_dir_exists "$(shadow_dir)" "shadow repo created on enable"
}

test_enable_is_idempotent() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local lines
  lines=$(wc -l < "$HOME/.claude-history/enabled-paths" | tr -d ' ')
  assert_eq "1" "$lines" "registry has $PWD only once"
}

test_enable_then_init_captures_turn() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s" "first prompt"
  run_commit "s"
  local subject
  subject=$(git --git-dir="$(shadow_dir)" log -1 --format='%s')
  assert_eq "first prompt" "$subject" "turn captured after enable"
}

# --- disable / pause --------------------------------------------------------

test_disable_unregisters_but_preserves_shadow_repo() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  bash "$PLUGIN_DIR/bin/history" disable >/dev/null

  assert_dir_exists "$(shadow_dir)" "shadow repo preserved"
  local registry
  registry=$(cat "$HOME/.claude-history/enabled-paths" 2>/dev/null || echo "")
  if [[ "$registry" == *"$PWD"* ]]; then
    echo "FAIL: registry still contains $PWD after disable"
    return 1
  fi
  # And subsequent hooks no-op
  echo "v2" > file.txt
  echo '{"session_id":"s","prompt":"after disable"}' \
    | bash "$PLUGIN_DIR/scripts/hook-init.sh"
  echo '{"session_id":"s"}' \
    | bash "$PLUGIN_DIR/scripts/hook-commit.sh"
  local count
  count=$(git --git-dir="$(shadow_dir)" rev-list --count HEAD)
  assert_eq "1" "$count" "no new commits after disable"
}

test_pause_is_alias_for_disable() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" pause >/dev/null
  local registry
  registry=$(cat "$HOME/.claude-history/enabled-paths" 2>/dev/null || echo "")
  if [[ "$registry" == *"$PWD"* ]]; then
    echo "FAIL: pause did not unregister"
    return 1
  fi
}

test_disable_when_already_disabled_is_idempotent() {
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" disable)
  assert_contains "$out" "already disabled" "disable on disabled prints already-disabled"
}

test_reenable_after_disable_resumes_capture() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  bash "$PLUGIN_DIR/bin/history" disable >/dev/null
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v2" > file.txt
  run_init "s" "second"
  run_commit "s"
  local count
  count=$(git --git-dir="$(shadow_dir)" rev-list --count HEAD)
  assert_eq "2" "$count" "second turn captured after re-enable"
}

# --- status -----------------------------------------------------------------

test_status_when_disabled() {
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" status)
  assert_contains "$out" "disabled for $PWD" "reports disabled"
  assert_contains "$out" "no shadow repo yet" "reports no repo"
}

test_status_when_enabled() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" status)
  assert_contains "$out" "enabled for $PWD" "reports enabled"
  assert_contains "$out" "shadow repo at" "reports repo path"
}

# --- wrapper hint -----------------------------------------------------------

test_wrapper_hints_enable_when_not_opted_in() {
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" log 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when not opted in"
    return 1
  fi
  assert_contains "$out" "not opted in" "hints to run enable"
  assert_contains "$out" "history enable" "shows the command"
}

test_wrapper_works_on_disabled_workspace_with_existing_repo() {
  # Capture some history, then disable. Read commands should still work.
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s" "first prompt"
  run_commit "s"
  bash "$PLUGIN_DIR/bin/history" disable >/dev/null

  local stdout stderr rc tmp_err
  tmp_err=$(mktemp)
  stdout=$(bash "$PLUGIN_DIR/bin/history" log --oneline 2>"$tmp_err") && rc=0 || rc=$?
  stderr=$(cat "$tmp_err"); rm -f "$tmp_err"

  assert_eq "0" "$rc" "git command succeeds against preserved repo"
  assert_contains "$stdout" "first prompt" "log output is intact"
  assert_contains "$stderr" "currently disabled" "notice printed on stderr"
  assert_contains "$stderr" "history enable" "notice points to resume command"
}

test_wrapper_silent_when_enabled() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  local stderr tmp_err
  tmp_err=$(mktemp)
  bash "$PLUGIN_DIR/bin/history" log --oneline >/dev/null 2>"$tmp_err"
  stderr=$(cat "$tmp_err"); rm -f "$tmp_err"
  assert_eq "" "$stderr" "no notice when enabled"
}
