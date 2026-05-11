# End-to-end tests covering full lifecycle scenarios.

test_e2e_three_turns_then_diff_and_restore() {
  # Turn 1: create file
  echo "v1" > readme.txt
  run_init "s" "create readme"
  run_commit "s"

  # Turn 2: modify file
  printf 'v1\nv2\n' > readme.txt
  run_init "s" "add line 2"
  run_commit "s"

  # Turn 3: add second file
  echo "code" > main.py
  run_init "s" "add main.py"
  run_commit "s"

  # Three commits should exist
  local count
  count=$(git --git-dir="$(shadow_dir)" rev-list --count HEAD)
  assert_eq "3" "$count" "three commits recorded"

  # Diff between turns shows the additions
  local diff_out
  diff_out=$(bash "$PLUGIN_DIR/bin/history" diff --no-color HEAD~2 HEAD~1 -- readme.txt)
  assert_contains "$diff_out" "v2" "diff shows added line"

  # Restore the original readme.txt from turn 1
  printf 'mutated content\n' > readme.txt
  bash "$PLUGIN_DIR/bin/history" checkout HEAD~2 -- readme.txt
  assert_eq "v1" "$(cat readme.txt)" "restored to turn 1 state"
}

test_e2e_session_filtering_via_grep() {
  echo "v1" > file.txt
  run_init "alpha" "alpha-prompt"
  run_commit "alpha"
  echo "v2" > file.txt
  run_init "beta" "beta-prompt"
  run_commit "beta"
  echo "v3" > file.txt
  run_init "alpha" "alpha-prompt-2"
  run_commit "alpha"

  local alpha_log
  alpha_log=$(bash "$PLUGIN_DIR/bin/history" log --grep "Session: alpha" --format='%s')
  assert_contains "$alpha_log" "alpha-prompt" "alpha 1st"
  assert_contains "$alpha_log" "alpha-prompt-2" "alpha 2nd"
  assert_not_contains "$alpha_log" "beta-prompt" "no beta in alpha-filtered log"

  local distinct_sessions
  distinct_sessions=$(bash "$PLUGIN_DIR/bin/history" log \
    --format='%(trailers:key=Session,valueonly,unfold)' | sort -u)
  assert_contains "$distinct_sessions" "alpha" "alpha listed"
  assert_contains "$distinct_sessions" "beta" "beta listed"
}
