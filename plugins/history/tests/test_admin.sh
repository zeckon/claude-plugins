# Tests for bin/history-admin — cross-repo administration.

test_admin_help_when_no_args() {
  local out
  out=$(bash "$PLUGIN_DIR/bin/history-admin")
  assert_contains "$out" "history-admin <command>" "help banner"
}

test_admin_unknown_command_rejected() {
  assert_fails "unknown subcommand" \
    bash "$PLUGIN_DIR/bin/history-admin" doesnt-exist
}

test_admin_list_when_no_repos() {
  local out
  out=$(bash "$PLUGIN_DIR/bin/history-admin" list)
  assert_contains "$out" "nothing tracked" "empty-list message"
}

test_admin_list_shows_workspace_paths_and_basenames() {
  echo "v1" > file.txt
  run_init "s1" "first"
  run_commit "s1"
  local out
  out=$(bash "$PLUGIN_DIR/bin/history-admin" list)
  assert_contains "$out" "$(basename "$PWD")" "list shows basename"
  assert_contains "$out" "$PWD" "list shows workspace path"
}

test_admin_gc_runs_safely_and_preserves_history() {
  echo "v1" > file.txt
  run_init "s1" "first"
  run_commit "s1"
  bash "$PLUGIN_DIR/bin/history-admin" gc >/dev/null
  # Repo should still be valid and have the commit
  local subject
  subject=$(git --git-dir="$(shadow_dir)" log -1 --format='%s')
  assert_eq "first" "$subject" "history preserved after gc"
}

test_admin_prune_orphan_dry_run_does_not_delete() {
  # Seed an alive repo and an orphan repo
  mkdir -p "$TEST_HOME/orphan"
  ( cd "$TEST_HOME/orphan" \
    && run_init "s" "x" \
    && echo "x" > f \
    && run_commit "s" )
  local orphan_repo
  orphan_repo=$(shadow_dir "$TEST_HOME/orphan")
  rm -rf "$TEST_HOME/orphan"
  assert_dir_exists "$orphan_repo" "orphan repo exists pre-prune"

  bash "$PLUGIN_DIR/bin/history-admin" prune-orphan --dry-run >/dev/null
  assert_dir_exists "$orphan_repo" "dry-run did not delete"
}

test_admin_prune_orphan_deletes_orphans_only() {
  # Alive repo (current $PWD)
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  local alive_repo
  alive_repo=$(shadow_dir)

  # Orphan repo (workspace gets deleted)
  mkdir -p "$TEST_HOME/orphan"
  ( cd "$TEST_HOME/orphan" \
    && run_init "s" "x" \
    && echo "x" > f \
    && run_commit "s" )
  local orphan_repo
  orphan_repo=$(shadow_dir "$TEST_HOME/orphan")
  rm -rf "$TEST_HOME/orphan"

  bash "$PLUGIN_DIR/bin/history-admin" prune-orphan >/dev/null

  assert_dir_exists "$alive_repo" "alive repo preserved"
  assert_dir_missing "$orphan_repo" "orphan repo deleted"
}

test_admin_remove_existing_repo() {
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  local repo dir_name
  repo=$(shadow_dir)
  dir_name=$(basename "$repo")

  bash "$PLUGIN_DIR/bin/history-admin" remove "$dir_name" >/dev/null
  assert_dir_missing "$repo" "remove deleted the repo"
}

test_admin_remove_rejects_path_traversal() {
  assert_fails "rejects ../etc"      bash "$PLUGIN_DIR/bin/history-admin" remove "../etc"
  assert_fails "rejects absolute"    bash "$PLUGIN_DIR/bin/history-admin" remove "/etc"
  assert_fails "rejects nested path" bash "$PLUGIN_DIR/bin/history-admin" remove "foo/bar"
}

test_admin_remove_missing_repo_errors() {
  assert_fails "remove nonexistent" \
    bash "$PLUGIN_DIR/bin/history-admin" remove "does-not-exist.git"
}

test_admin_prune_old_dry_run_does_not_delete() {
  echo "v1" > file.txt
  run_init "s" "first"
  run_commit "s"
  bash "$PLUGIN_DIR/bin/history-admin" prune-old 1 --dry-run >/dev/null
  # Recent repo, so dry-run should report nothing AND not delete
  assert_dir_exists "$(shadow_dir)" "dry-run preserves recent repo"
}

test_admin_prune_old_rejects_non_integer() {
  assert_fails "non-integer days" \
    bash "$PLUGIN_DIR/bin/history-admin" prune-old "abc"
}
