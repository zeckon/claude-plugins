# Tests for scripts/_paths.sh — workspace-id hashing, state dir computation,
# and config locator.

test_paths_state_dir_format() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  # State dir is $HOME/.claude-devcontainers/<basename>-<6 hex chars>
  expected="$HOME/.claude-devcontainers/$(basename "$PWD")-$(printf '%s' "$PWD" | shasum | cut -c1-6)"
  assert_eq "$expected" "$DC_STATE_DIR" "DC_STATE_DIR"
}

test_paths_state_dir_unique_per_path() {
  # Two different workspaces produce different state dirs.
  cd "$TEST_HOME"
  mkdir -p "$TEST_HOME/proj-a" "$TEST_HOME/proj-b"
  cd "$TEST_HOME/proj-a"
  source "$PLUGIN_DIR/scripts/_paths.sh"
  dir_a="$DC_STATE_DIR"
  cd "$TEST_HOME/proj-b"
  source "$PLUGIN_DIR/scripts/_paths.sh"
  dir_b="$DC_STATE_DIR"
  if [ "$dir_a" = "$dir_b" ]; then
    echo "FAIL: expected different state dirs for different paths"
    echo "  proj-a: $dir_a"
    echo "  proj-b: $dir_b"
    exit 1
  fi
}

test_paths_init_state_dir_idempotent() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  dc_init_state_dir
  assert_dir_exists "$DC_STATE_DIR" "first init"
  assert_file_exists "$DC_STATE_DIR/workspace-root" "stamp file"
  # Second call shouldn't fail
  dc_init_state_dir
  assert_dir_exists "$DC_STATE_DIR" "second init"
  assert_eq "$PWD" "$(cat "$DC_STATE_DIR/workspace-root")" "workspace-root content"
}

test_paths_find_config_devcontainer_subdir() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  assert_eq "$PWD/.devcontainer/devcontainer.json" "$(dc_find_config)" "subdir form"
}

test_paths_find_config_root() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  echo '{}' > .devcontainer.json
  assert_eq "$PWD/.devcontainer.json" "$(dc_find_config)" "root form"
}

test_paths_find_config_subdir_named() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p .devcontainer/myenv
  echo '{}' > .devcontainer/myenv/devcontainer.json
  assert_eq "$PWD/.devcontainer/myenv/devcontainer.json" "$(dc_find_config)" "named subdir form"
}

test_paths_find_config_priority() {
  # When multiple forms exist, .devcontainer/devcontainer.json wins.
  source "$PLUGIN_DIR/scripts/_paths.sh"
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  echo '{}' > .devcontainer.json
  assert_eq "$PWD/.devcontainer/devcontainer.json" "$(dc_find_config)" "priority"
}

test_paths_find_config_none() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  if dc_find_config >/dev/null 2>&1; then
    echo "FAIL: expected dc_find_config to fail when no config exists"
    exit 1
  fi
  if dc_has_config; then
    echo "FAIL: expected dc_has_config to return false when no config exists"
    exit 1
  fi
}
