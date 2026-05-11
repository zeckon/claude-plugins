# Tests for bin/history — the per-project wrapper that forwards args to git.

test_wrapper_errors_when_no_repo() {
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" log 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when no shadow repo exists"
    return 1
  fi
  assert_contains "$out" "no shadow-history repo" "error message text"
}

test_wrapper_forwards_log_to_git() {
  echo "v1" > file.txt
  run_init "s1" "first prompt"
  run_commit "s1"
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" log --oneline)
  assert_contains "$out" "first prompt" "log subject"
}

test_wrapper_forwards_show_to_git() {
  echo "v1" > file.txt
  run_init "s1" "first prompt"
  run_commit "s1"
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" show --no-color HEAD)
  assert_contains "$out" "first prompt" "show subject"
  assert_contains "$out" "Session: s1" "show trailer"
}

test_wrapper_diff_against_past_ref() {
  echo "v1" > file.txt
  run_init "s1" "first"
  run_commit "s1"
  echo "v2" > file.txt
  run_init "s1" "second"
  run_commit "s1"
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" diff --no-color HEAD~1)
  assert_contains "$out" "v1" "diff shows old content"
  assert_contains "$out" "v2" "diff shows new content"
}
