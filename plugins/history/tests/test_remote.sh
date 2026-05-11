# Tests for the opt-in remote-sync feature: remote URL management, push
# enable/disable with the privacy gate, manual push to a local bare-repo
# "remote", pull, clone, status extension, and the hook-driven auto-push.

# Set up a local bare repo to act as the remote, return its path.
make_remote() {
  local r="$TEST_HOME/remote.git"
  git init --bare --quiet "$r"
  echo "$r"
}

# --- remote subcommand ------------------------------------------------------

test_remote_show_when_unset() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" remote)
  assert_contains "$out" "no remote configured" "remote with no args reports unset"
}

test_remote_set_then_show() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r out
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
  out=$(bash "$PLUGIN_DIR/bin/history" remote)
  assert_eq "$r" "$out" "remote shows the configured URL"
}

test_remote_set_replaces_existing() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r1 r2 out
  r1=$(make_remote)
  r2="$TEST_HOME/remote2.git"
  git init --bare --quiet "$r2"
  bash "$PLUGIN_DIR/bin/history" remote "$r1" >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$r2" >/dev/null
  out=$(bash "$PLUGIN_DIR/bin/history" remote)
  assert_eq "$r2" "$out" "second set replaces the first"
}

test_remote_clear() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r out
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote --clear >/dev/null
  out=$(bash "$PLUGIN_DIR/bin/history" remote)
  assert_contains "$out" "no remote configured" "after --clear, no remote configured"
}

test_remote_clear_when_unset_is_idempotent() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" remote --clear)
  assert_contains "$out" "no remote to clear" "clearing nothing reports nothing to clear"
}

test_remote_without_repo_errors() {
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" remote 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when repo doesn't exist"
    exit 1
  fi
  assert_contains "$out" "no shadow-history repo" "errors when no repo"
}

# --- push-enable / push-disable / privacy gate ------------------------------

test_push_enable_requires_remote() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" push-enable 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: push-enable should fail without remote"
    exit 1
  fi
  assert_contains "$out" "no remote configured" "explains the missing remote"
}

test_push_enable_first_call_prints_privacy_gate() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" push-enable 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: first push-enable without --yes should refuse"
    exit 1
  fi
  assert_contains "$out" "exclude" "prints the exclude-set"
  assert_contains "$out" ".env" "lists .env"
  assert_contains "$out" "--yes" "tells user how to proceed"
}

test_push_enable_with_yes_enables() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" push-enable --yes)
  assert_contains "$out" "enabled" "confirms enable"
  local flag
  flag=$(git --git-dir="$(shadow_dir)" config --bool history.auto-push 2>/dev/null)
  assert_eq "true" "$flag" "auto-push flag set"
  flag=$(git --git-dir="$(shadow_dir)" config --bool history.push-acked 2>/dev/null)
  assert_eq "true" "$flag" "ack flag set"
}

test_push_enable_subsequent_calls_skip_gate() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-enable --yes >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-disable >/dev/null
  # Now re-enable without --yes — should succeed since ack was previously stored.
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" push-enable 2>&1) && rc=0 || rc=$?
  assert_eq "0" "$rc" "second enable skips gate"
  assert_contains "$out" "enabled" "confirms enable"
}

test_push_disable_unsets_flag() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-enable --yes >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-disable >/dev/null
  local flag
  flag=$(git --git-dir="$(shadow_dir)" config --bool history.auto-push 2>/dev/null)
  assert_eq "false" "$flag" "auto-push flag unset"
}

test_push_disable_when_off_is_idempotent() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" push-disable)
  assert_contains "$out" "already disabled" "reports already disabled"
}

# --- push (manual) ----------------------------------------------------------

test_push_requires_remote() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" push 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: push should fail without remote"
    exit 1
  fi
  assert_contains "$out" "no remote configured" "explains missing remote"
}

test_push_requires_commits() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" push 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: push should fail with no commits"
    exit 1
  fi
  assert_contains "$out" "nothing to push" "explains empty repo"
}

test_push_sends_to_host_branch() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null

  echo "v1" > file.txt
  run_init "s" "first prompt"
  run_commit "s"

  bash "$PLUGIN_DIR/bin/history" push >/dev/null

  # The host branch should now exist on the remote.
  local host branches
  host=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)
  host=$(printf '%s' "$host" | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//;s/-*$//')
  [ -z "$host" ] && host="unknown"
  branches=$(git --git-dir="$r" branch --list 2>/dev/null | tr -d ' *')
  assert_contains "$branches" "host/$host" "remote has host/<hostname> branch"
}

# --- pull -------------------------------------------------------------------

test_pull_requires_remote() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" pull 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: pull should fail without remote"
    exit 1
  fi
  assert_contains "$out" "no remote configured" "explains missing remote"
}

test_pull_fetches_remote_refs() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null

  # Make a commit and push to the remote first, so there's something to pull.
  echo "v1" > file.txt
  run_init "s" "first prompt"
  run_commit "s"
  bash "$PLUGIN_DIR/bin/history" push >/dev/null

  # Pull should fetch and update remote-tracking refs.
  bash "$PLUGIN_DIR/bin/history" pull >/dev/null 2>&1

  local host
  host=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)
  host=$(printf '%s' "$host" | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//;s/-*$//')
  [ -z "$host" ] && host="unknown"
  if ! git --git-dir="$(shadow_dir)" rev-parse --quiet --verify "refs/remotes/origin/host/$host" >/dev/null 2>&1; then
    echo "FAIL: expected origin/host/$host remote-tracking ref to exist after pull"
    exit 1
  fi
}

# --- clone ------------------------------------------------------------------

test_clone_bootstraps_repo_and_enables() {
  # Set up an upstream remote with one commit so we have something to clone.
  local upstream_workspace="$TEST_HOME/upstream-ws"
  mkdir -p "$upstream_workspace"
  (
    cd "$upstream_workspace"
    bash "$PLUGIN_DIR/bin/history" enable >/dev/null
    local r
    r=$(make_remote)
    bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
    echo "u1" > seed.txt
    run_init "u" "upstream turn"
    run_commit "u"
    bash "$PLUGIN_DIR/bin/history" push >/dev/null
  )

  # Now in the original test workspace, clone from the same remote.
  local r="$TEST_HOME/remote.git"
  bash "$PLUGIN_DIR/bin/history" clone "$r" >/dev/null
  assert_dir_exists "$(shadow_dir)" "shadow repo created by clone"
  assert_file_exists "$HOME/.claude-history/enabled-paths" "registry created"
  local registry
  registry=$(cat "$HOME/.claude-history/enabled-paths")
  assert_contains "$registry" "$PWD" "current workspace registered"
  # Workspace-path file should reflect the current $PWD, not the upstream's.
  local recorded
  recorded=$(cat "$(shadow_dir)/.workspace-path")
  assert_eq "$PWD" "$recorded" "workspace-path reflects clone target"
}

test_clone_refuses_when_repo_exists() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" clone "$(make_remote)" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: clone over existing repo should fail"
    exit 1
  fi
  assert_contains "$out" "already exists" "explains existing repo"
}

test_clone_requires_url() {
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" clone 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: clone with no URL should fail"
    exit 1
  fi
  assert_contains "$out" "usage" "prints usage"
}

# --- status extension -------------------------------------------------------

test_status_shows_remote_when_set() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" status)
  assert_contains "$out" "$r" "status includes remote URL"
  assert_contains "$out" "auto-push: off" "status reports auto-push off"
}

test_status_reports_auto_push_on() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  bash "$PLUGIN_DIR/bin/history" remote "$(make_remote)" >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-enable --yes >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" status)
  assert_contains "$out" "auto-push: on" "status reports auto-push on"
}

test_status_when_no_remote() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local out
  out=$(bash "$PLUGIN_DIR/bin/history" status)
  assert_contains "$out" "remote: not configured" "status reports unset remote"
}

# --- hook-driven auto-push --------------------------------------------------

test_hook_pushes_when_enabled() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
  bash "$PLUGIN_DIR/bin/history" push-enable --yes >/dev/null

  echo "v1" > file.txt
  run_init "s" "auto-push turn"
  run_commit "s"

  # Hook backgrounds the push; wait briefly for it to land. Local file://
  # push is sub-second but we tolerate up to 5s of CI slowness.
  local host i ref_found=0
  host=$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)
  host=$(printf '%s' "$host" | tr -c 'A-Za-z0-9._-' '-' | sed 's/^-*//;s/-*$//')
  [ -z "$host" ] && host="unknown"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if git --git-dir="$r" rev-parse --quiet --verify "refs/heads/host/$host" >/dev/null 2>&1; then
      ref_found=1
      break
    fi
    sleep 0.5
  done
  assert_eq "1" "$ref_found" "remote received host/<hostname> branch from hook"
}

test_hook_skips_push_when_disabled() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  local r
  r=$(make_remote)
  bash "$PLUGIN_DIR/bin/history" remote "$r" >/dev/null
  # Note: NOT calling push-enable, so auto-push stays off.

  echo "v1" > file.txt
  run_init "s" "no-push turn"
  run_commit "s"

  sleep 1
  local branches
  branches=$(git --git-dir="$r" branch --list 2>/dev/null | tr -d ' *')
  assert_eq "" "$branches" "remote stays empty when auto-push off"
}
