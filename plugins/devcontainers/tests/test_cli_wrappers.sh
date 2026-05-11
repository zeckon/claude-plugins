# Tests for `bin/devcontainers` CLI wrapper subcommands: validate, build, up,
# exec, rebuild — including --service routing via docker compose.

DC_BIN="$PLUGIN_DIR/bin/devcontainers"

# Set up an image-based config (no compose). All --service-less calls in this
# fixture should hit the devcontainer CLI, never docker compose.
fixture_image_config() {
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{ "name": "t", "image": "mcr.microsoft.com/devcontainers/base:1" }
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "configuration": { "name": "t", "image": "mcr.microsoft.com/devcontainers/base:1" },
  "mergedConfiguration": { "name": "t", "image": "mcr.microsoft.com/devcontainers/base:1" }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
  stub_recorder docker
}

# Set up a compose-based config with two services (`app` primary, `db` extra)
# AND a docker stub that reports a running primary container so the wrapper's
# project-discovery succeeds. Project name: "myproj_devcontainer".
fixture_compose_config() {
  mkdir -p .devcontainer
  cat > .devcontainer/devcontainer.json <<'EOF'
{ "dockerComposeFile": "docker-compose.yml", "service": "app" }
EOF
  cat > "$TEST_HOME/merged-config.json" <<'EOF'
{
  "configuration": {
    "dockerComposeFile": "docker-compose.yml",
    "service": "app"
  },
  "mergedConfiguration": {
    "dockerComposeFile": ["docker-compose.yml"],
    "service": "app"
  }
}
EOF
  stub_devcontainer_with_config "$TEST_HOME/merged-config.json"
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
    echo "myproj_devcontainer"
    ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/docker"
}

# Same as fixture_compose_config but with no running primary — project
# discovery returns empty. Used to exercise the "run /devcontainers:up first"
# error path.
fixture_compose_config_no_primary_running() {
  fixture_compose_config
  cat > "$STUB_BIN/docker" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$STUB_BIN/docker.log"
# ps returns nothing; inspect never gets called
exit 0
EOF
  chmod +x "$STUB_BIN/docker"
}

# --- validate ---

test_validate_invokes_read_configuration() {
  fixture_image_config
  bash "$DC_BIN" validate >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "read-configuration" "validate calls read-configuration"
  assert_contains "$log" "--include-merged-configuration" "validate uses merged"
}

# --- build ---

test_build_default_uses_devcontainer_cli() {
  fixture_image_config
  bash "$DC_BIN" build >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "build --workspace-folder ." "default build via CLI"
  doc_log=$(stub_log docker)
  assert_eq "" "$doc_log" "docker NOT invoked"
}

test_build_no_cache_passes_flag() {
  fixture_image_config
  bash "$DC_BIN" build --no-cache >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "build --workspace-folder . --no-cache" "no-cache flag"
}

test_build_service_uses_docker_compose() {
  fixture_compose_config
  bash "$DC_BIN" build --service db >/dev/null 2>&1
  doc_log=$(stub_log docker)
  assert_contains "$doc_log" "compose -p myproj_devcontainer -f $PWD/.devcontainer/docker-compose.yml build db" "docker compose build with -p and -f"
}

test_build_service_no_cache_compose() {
  fixture_compose_config
  bash "$DC_BIN" build --service db --no-cache >/dev/null 2>&1
  doc_log=$(stub_log docker)
  assert_contains "$doc_log" "build --no-cache db" "no-cache passes through to compose"
  assert_contains "$doc_log" "-p myproj_devcontainer" "project flag still present"
}

test_build_service_matches_primary_uses_cli() {
  fixture_compose_config
  bash "$DC_BIN" build --service app >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "build --workspace-folder ." "primary service uses CLI"
  doc_log=$(stub_log docker)
  assert_eq "" "$doc_log" "docker not invoked for primary"
}

# --- up ---

test_up_default_uses_devcontainer_cli() {
  fixture_image_config
  bash "$DC_BIN" up >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --workspace-folder ." "default up via CLI"
}

test_up_service_uses_docker_compose() {
  fixture_compose_config
  bash "$DC_BIN" up --service db >/dev/null 2>&1
  doc_log=$(stub_log docker)
  assert_contains "$doc_log" "compose -p myproj_devcontainer -f $PWD/.devcontainer/docker-compose.yml up -d db" "compose up -d with -p"
}

# --- exec ---

test_exec_default_uses_devcontainer_exec() {
  fixture_image_config
  bash "$DC_BIN" exec -- ls /workspaces >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "exec --workspace-folder . -- ls /workspaces" "exec via CLI"
}

test_exec_without_dashdash() {
  # Args after subcommand are accepted as the command even without --
  fixture_image_config
  bash "$DC_BIN" exec hostname >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "exec --workspace-folder . -- hostname" "exec without --"
}

test_exec_service_uses_docker_compose() {
  fixture_compose_config
  bash "$DC_BIN" exec --service db -- psql -U postgres >/dev/null 2>&1
  doc_log=$(stub_log docker)
  assert_contains "$doc_log" "compose -p myproj_devcontainer -f $PWD/.devcontainer/docker-compose.yml exec db psql -U postgres" "compose exec with -p"
}

test_exec_no_command_fails() {
  fixture_image_config
  set +e
  bash "$DC_BIN" exec >/dev/null 2>&1
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
}

# --- rebuild ---

test_rebuild_default_uses_remove_existing() {
  fixture_image_config
  bash "$DC_BIN" rebuild >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "up --remove-existing-container --workspace-folder ." "rebuild via CLI"
}

test_rebuild_service_uses_compose_force_recreate() {
  fixture_compose_config
  bash "$DC_BIN" rebuild --service db >/dev/null 2>&1
  doc_log=$(stub_log docker)
  assert_contains "$doc_log" "compose -p myproj_devcontainer -f $PWD/.devcontainer/docker-compose.yml up -d --force-recreate --no-deps db" "compose force-recreate with -p"
}

# --- error cases ---

test_service_on_image_config_fails() {
  # --service on a non-compose config should error out with a clear message.
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" exec --service db -- ls 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "compose-based config" "clear error"
}

test_service_without_value_fails() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" exec --service 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "--service requires a value" "missing value"
}

test_service_without_running_primary_fails() {
  fixture_compose_config_no_primary_running
  set +e
  out=$(bash "$DC_BIN" exec --service db -- ls 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no running devcontainer found" "clear error"
  assert_contains "$out" "/devcontainers:up first" "remediation hint"
  # docker should have been called for project discovery (ps), but compose
  # itself should NOT have been invoked.
  doc_log=$(stub_log docker)
  assert_not_contains "$doc_log" "compose " "compose not invoked when no primary"
}

test_extra_args_rejected_for_build() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" build extra-junk 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "build takes no positional args" "rejection"
}

test_extra_args_rejected_for_up() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" up extra-junk 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "up takes no positional args" "rejection"
}

test_extra_args_rejected_for_rebuild() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" rebuild extra-junk 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "rebuild takes no positional args" "rejection"
}

test_validate_propagates_cli_failure() {
  # Stub `devcontainer` to exit non-zero. The wrapper should propagate the
  # exit code rather than silently returning 0.
  cat > "$STUB_BIN/devcontainer" <<'EOF'
#!/usr/bin/env bash
echo "stub: simulated parse error" >&2
exit 7
EOF
  chmod +x "$STUB_BIN/devcontainer"
  set +e
  bash "$DC_BIN" validate >/dev/null 2>&1
  rc=$?
  set -e
  assert_eq_rc 7 "$rc"
}

test_build_propagates_cli_failure() {
  cat > "$STUB_BIN/devcontainer" <<'EOF'
#!/usr/bin/env bash
exit 5
EOF
  chmod +x "$STUB_BIN/devcontainer"
  set +e
  bash "$DC_BIN" build >/dev/null 2>&1
  rc=$?
  set -e
  assert_eq_rc 5 "$rc"
}

# --- --no-cache scoping (M4) ---

test_no_cache_passes_through_to_exec() {
  # exec --no-cache ls should NOT intercept --no-cache; it's part of the
  # inner command. The wrapper invokes `devcontainer exec ... -- --no-cache ls`.
  fixture_image_config
  bash "$DC_BIN" exec --no-cache ls >/dev/null 2>&1
  log=$(stub_log devcontainer)
  assert_contains "$log" "exec --workspace-folder . -- --no-cache ls" "no-cache reaches inner command"
}

test_no_cache_rejected_for_up() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" up --no-cache 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "up takes no positional args" "rejection"
}

test_no_cache_rejected_for_rebuild() {
  fixture_image_config
  set +e
  out=$(bash "$DC_BIN" rebuild --no-cache 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "rebuild takes no positional args" "rejection"
}

# --- no-config error message (M5) ---

test_service_without_config_fails_with_init_hint() {
  # No devcontainer.json on disk at all. --service should hint at init,
  # not the more confusing "no dockerComposeFile" message.
  stub_recorder devcontainer
  set +e
  out=$(bash "$DC_BIN" exec --service db -- ls 2>&1)
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
  assert_contains "$out" "no devcontainer.json found" "no-config error"
  assert_contains "$out" "/devcontainers:init" "remediation hint"
}
