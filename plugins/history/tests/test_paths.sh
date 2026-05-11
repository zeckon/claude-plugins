# Tests for scripts/_paths.sh — shadow-repo path resolution.

test_paths_resolves_pwd_to_expected_locations() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  assert_eq "$HOME/.claude-history" "$HISTORY_DIR" "HISTORY_DIR"
  local expected_hash
  expected_hash=$(printf '%s' "$PWD" | shasum | cut -c1-6)
  assert_eq "$HOME/.claude-history/$(basename "$PWD")-$expected_hash.git" \
    "$GIT_DIR" "GIT_DIR"
}

test_paths_hash_is_deterministic() {
  local h1 h2
  h1=$(cd "$TEST_WORKSPACE" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$HASH")
  h2=$(cd "$TEST_WORKSPACE" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$HASH")
  assert_eq "$h1" "$h2" "hash deterministic for same PWD"
}

test_paths_different_dirs_produce_different_hashes() {
  mkdir -p "$TEST_HOME/proj-a" "$TEST_HOME/proj-b"
  local ha hb
  ha=$(cd "$TEST_HOME/proj-a" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$HASH")
  hb=$(cd "$TEST_HOME/proj-b" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$HASH")
  if [ "$ha" = "$hb" ]; then
    echo "FAIL: distinct paths produced same hash ($ha)"
    return 1
  fi
}

test_paths_same_basename_different_paths_resolve_distinctly() {
  mkdir -p "$TEST_HOME/x/myproj" "$TEST_HOME/y/myproj"
  local da db
  da=$(cd "$TEST_HOME/x/myproj" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$GIT_DIR")
  db=$(cd "$TEST_HOME/y/myproj" && source "$PLUGIN_DIR/scripts/_paths.sh" && echo "$GIT_DIR")
  if [ "$da" = "$db" ]; then
    echo "FAIL: same basename in different paths produced same GIT_DIR"
    echo "  $da"
    return 1
  fi
}
