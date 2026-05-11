# Tests for scripts/_compose.sh — primary-service, compose-files, workspace
# folder extraction from the merged config.

write_compose_config() {
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{
  "name": "test",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspaces/test"
}
EOF
  # The merged config the stub returns when asked. workspaceFolder is
  # echoed in mergedConfiguration so the helper picks it up.
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "configuration": {
    "name": "test",
    "dockerComposeFile": "docker-compose.yml",
    "service": "app",
    "workspaceFolder": "/workspaces/test"
  },
  "mergedConfiguration": {
    "name": "test",
    "dockerComposeFile": ["docker-compose.yml"],
    "service": "app",
    "workspaceFolder": "/workspaces/test"
  },
  "workspace": {
    "workspaceFolder": "/workspaces/test"
  }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
}

write_image_config() {
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{
  "name": "test",
  "image": "mcr.microsoft.com/devcontainers/base:1"
}
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "configuration": {
    "name": "test",
    "image": "mcr.microsoft.com/devcontainers/base:1"
  },
  "mergedConfiguration": {
    "name": "test",
    "image": "mcr.microsoft.com/devcontainers/base:1"
  }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
}

test_compose_primary_service_returns_field() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  write_compose_config
  out=$(dc_primary_service)
  assert_eq "app" "$out" "primary service"
}

test_compose_primary_service_empty_for_image_config() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  write_image_config
  out=$(dc_primary_service)
  assert_eq "" "$out" "primary service for image config"
}

test_compose_files_resolves_relative_paths() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  write_compose_config
  expected="$PWD/.devcontainer/docker-compose.yml"
  out=$(dc_compose_files)
  assert_eq "$expected" "$out" "resolved compose file path"
}

test_compose_files_handles_array() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{ "dockerComposeFile": ["a.yml", "b.yml"], "service": "app" }
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "mergedConfiguration": {
    "dockerComposeFile": ["a.yml", "b.yml"],
    "service": "app"
  },
  "configuration": {
    "dockerComposeFile": ["a.yml", "b.yml"],
    "service": "app"
  }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
  out=$(dc_compose_files)
  assert_contains "$out" "$PWD/.devcontainer/a.yml" "first file"
  assert_contains "$out" "$PWD/.devcontainer/b.yml" "second file"
}

test_compose_files_preserves_absolute_paths() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{ "dockerComposeFile": "/abs/path/compose.yml", "service": "app" }
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "mergedConfiguration": {
    "dockerComposeFile": "/abs/path/compose.yml",
    "service": "app"
  },
  "configuration": {
    "dockerComposeFile": "/abs/path/compose.yml",
    "service": "app"
  }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
  out=$(dc_compose_files)
  assert_eq "/abs/path/compose.yml" "$out" "absolute path preserved"
}

test_compose_files_empty_for_image_config() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  write_image_config
  out=$(dc_compose_files)
  assert_eq "" "$out" "no compose files for image config"
}

# A docker stub that pretends a devcontainer-labeled container is running and
# that its compose project is $1. `docker ps -q --filter ...` returns the
# fake id; `docker inspect ...` returns the project-name label.
stub_docker_with_project() {
  local proj="$1"
  cat > "$STUB_BIN/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/docker.log"
case "\$1" in
  ps)
    if [[ "\$*" == *"label=devcontainer.local_folder"* ]]; then
      echo "fakecontainer123"
    fi
    ;;
  inspect)
    echo "$proj"
    ;;
  compose)
    : # recorded by the log line above
    ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/docker"
}

# A docker stub where no devcontainer is running (ps returns empty).
stub_docker_no_running_devcontainer() {
  cat > "$STUB_BIN/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/docker.log"
# ps returns nothing; inspect would fail but never gets called
exit 0
EOF
  chmod +x "$STUB_BIN/docker"
}

test_compose_project_returns_label() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  stub_docker_with_project "myproj_devcontainer"
  out=$(dc_compose_project)
  assert_eq "myproj_devcontainer" "$out" "project from label"
}

test_compose_project_empty_when_no_running_container() {
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  stub_docker_no_running_devcontainer
  set +e
  out=$(dc_compose_project)
  rc=$?
  set -e
  assert_eq "" "$out" "no project"
  assert_eq_rc 1 "$rc"
}

test_compose_project_returns_1_when_no_docker() {
  # No docker stub, no /usr/bin/docker on this CI image either.
  if command -v docker >/dev/null 2>&1; then
    echo "skip: real docker is on PATH (test would call into it)"
    return 0
  fi
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  set +e
  dc_compose_project >/dev/null
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
}

test_compose_project_realpath_fallback() {
  # Simulate a symlinked $PWD where the CLI labeled the container with the
  # resolved path. Stub realpath to return a known-different value, and stub
  # docker so ps matches only that resolved value.
  source "$PLUGIN_DIR/scripts/_paths.sh"
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  source "$PLUGIN_DIR/scripts/_compose.sh"
  cat > "$STUB_BIN/realpath" <<EOF
#!/usr/bin/env bash
echo "/resolved/workspace/path"
EOF
  chmod +x "$STUB_BIN/realpath"
  cat > "$STUB_BIN/docker" <<EOF
#!/usr/bin/env bash
case "\$1" in
  ps)
    # Match only when filter contains the *resolved* path
    if [[ "\$*" == *"label=devcontainer.local_folder=/resolved/workspace/path"* ]]; then
      echo "fakecontainer-via-realpath"
    fi
    # Filter against \$PWD returns empty (no match) → wrapper falls back.
    ;;
  inspect)
    echo "myproj_devcontainer"
    ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/docker"
  out=$(dc_compose_project)
  assert_eq "myproj_devcontainer" "$out" "project found via realpath fallback"
}
