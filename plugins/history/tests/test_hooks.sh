# Tests for scripts/hook-init.sh and scripts/hook-commit.sh.

test_init_creates_bare_repo() {
  run_init "s1" "first prompt"
  assert_dir_exists "$(shadow_dir)" "shadow repo dir"
  assert_file_exists "$(shadow_dir)/HEAD" "bare repo HEAD"
}

test_init_records_workspace_path() {
  run_init "s1" "first"
  assert_file_exists "$(shadow_dir)/.workspace-path"
  assert_eq "$PWD" "$(cat "$(shadow_dir)/.workspace-path")" "workspace-path content"
}

test_init_creates_exclude_file() {
  run_init "s1" "first"
  local excl
  excl=$(cat "$(shadow_dir)/info/exclude")
  assert_contains "$excl" ".env" "exclude .env"
  assert_contains "$excl" "node_modules/" "exclude node_modules"
  assert_contains "$excl" ".git/" "exclude .git"
}

test_init_writes_per_session_prompt_files() {
  run_init "sess-A" "hello A"
  run_init "sess-B" "hello B"
  assert_file_exists "$(shadow_dir)/.last-prompt-sess-A"
  assert_file_exists "$(shadow_dir)/.last-prompt-sess-B"
  assert_eq "hello A" "$(cat "$(shadow_dir)/.last-prompt-sess-A")" "A's prompt"
  assert_eq "hello B" "$(cat "$(shadow_dir)/.last-prompt-sess-B")" "B's prompt"
}

test_init_idempotent_on_existing_repo() {
  run_init "s1" "first"
  local before_mtime
  before_mtime=$(stat -f %m "$(shadow_dir)/HEAD" 2>/dev/null \
    || stat -c %Y "$(shadow_dir)/HEAD")
  sleep 1
  run_init "s2" "second"
  local after_mtime
  after_mtime=$(stat -f %m "$(shadow_dir)/HEAD" 2>/dev/null \
    || stat -c %Y "$(shadow_dir)/HEAD")
  assert_eq "$before_mtime" "$after_mtime" "HEAD mtime preserved (no reinit)"
}

test_init_handles_malformed_json() {
  enable_workspace
  echo "not even json" | bash "$PLUGIN_DIR/scripts/hook-init.sh"
  # Repo creation happens before JSON parse, so the repo should still exist
  assert_dir_exists "$(shadow_dir)" "repo created despite bad JSON"
}

test_init_handles_empty_session_id() {
  enable_workspace
  echo '{"prompt":"no session"}' | bash "$PLUGIN_DIR/scripts/hook-init.sh"
  assert_file_exists "$(shadow_dir)/.last-prompt-unknown"
  assert_eq "no session" "$(cat "$(shadow_dir)/.last-prompt-unknown")"
}

test_commit_creates_commit_with_session_trailer() {
  echo "v1" > file.txt
  run_init "sess-A" "add file"
  run_commit "sess-A"

  local msg
  msg=$(git --git-dir="$(shadow_dir)" log -1 --format='%B')
  assert_contains "$msg" "add file" "subject = prompt"
  assert_contains "$msg" "Session: sess-A" "session trailer"
}

test_commit_falls_back_to_turn_when_no_prompt_file() {
  run_init "sess-X" ""
  rm -f "$(shadow_dir)/.last-prompt-sess-X"
  echo "v1" > file.txt
  run_commit "sess-X"
  local subject
  subject=$(git --git-dir="$(shadow_dir)" log -1 --format='%s')
  assert_eq "turn" "$subject" "fallback subject"
}

test_commit_no_op_when_no_repo() {
  # No init. Stop hook should silently no-op, not create the repo.
  run_commit "s1"
  assert_dir_missing "$(shadow_dir)" "Stop alone does not create repo"
}

test_commit_excludes_apply() {
  echo "v1" > file.txt
  echo "secret" > .env
  mkdir -p node_modules && echo "junk" > node_modules/foo.js
  run_init "s1" "first"
  run_commit "s1"
  local files
  files=$(git --git-dir="$(shadow_dir)" ls-tree -r --name-only HEAD)
  assert_contains "$files" "file.txt" "tracked file present"
  assert_not_contains "$files" ".env" "env excluded"
  assert_not_contains "$files" "node_modules" "node_modules excluded"
}

test_multisession_prompts_dont_clobber() {
  # The bug v0.1 had: shared .last-prompt clobbered across sessions.
  # The fix: per-session files. This test verifies attribution is correct
  # even when sessions interleave init/commit calls.
  echo "v1" > file.txt

  run_init "sess-A" "fix bug X"
  run_init "sess-B" "add feature Y"
  echo "v2-from-A" > file.txt
  run_commit "sess-A"
  echo "v3-from-B" > file.txt
  run_commit "sess-B"

  # Newest commit first; B was committed last.
  local b_msg a_msg
  b_msg=$(git --git-dir="$(shadow_dir)" log -1 --format='%B' HEAD)
  a_msg=$(git --git-dir="$(shadow_dir)" log -1 --format='%B' HEAD~1)

  assert_contains "$b_msg" "add feature Y" "B subject"
  assert_contains "$b_msg" "Session: sess-B" "B trailer"
  assert_contains "$a_msg" "fix bug X" "A subject"
  assert_contains "$a_msg" "Session: sess-A" "A trailer"
}
