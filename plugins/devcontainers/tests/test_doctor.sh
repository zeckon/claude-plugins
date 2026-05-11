# Tests for `bin/devcontainers doctor` output sections.

DC_BIN="$PLUGIN_DIR/bin/devcontainers"

test_doctor_reports_docker_missing() {
  if command -v docker >/dev/null 2>&1; then
    echo "skip: docker is present on this system"
    return 0
  fi
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "Docker: not found" "docker missing line"
}

test_doctor_reports_node_missing() {
  if command -v node >/dev/null 2>&1; then
    echo "skip: node is present on this system"
    return 0
  fi
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "Node.js: not found" "node missing line"
}

test_doctor_reports_cli_missing() {
  if command -v devcontainer >/dev/null 2>&1; then
    echo "skip: devcontainer is present on this system"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    # CLI not present, but npx is: should say so.
    out=$(bash "$DC_BIN" doctor 2>&1)
    assert_contains "$out" "@devcontainers/cli: no global install" "cli missing-with-npx line"
  else
    out=$(bash "$DC_BIN" doctor 2>&1)
    assert_contains "$out" "@devcontainers/cli: unavailable" "cli unavailable line"
  fi
}

test_doctor_reports_global_cli() {
  stub_bin devcontainer "0.65.0" 0
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "@devcontainers/cli: global install" "cli global line"
}

test_doctor_reports_no_config() {
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "Config: none" "no-config line"
}

test_doctor_reports_existing_config() {
  mkdir -p .devcontainer
  echo '{}' > .devcontainer/devcontainer.json
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" ".devcontainer/devcontainer.json" "config-found line"
}

test_doctor_exit_code_is_zero() {
  set +e
  bash "$DC_BIN" doctor >/dev/null 2>&1
  rc=$?
  set -e
  assert_eq_rc 0 "$rc"
}

test_unknown_subcommand_fails() {
  set +e
  bash "$DC_BIN" not-a-subcommand >/dev/null 2>&1
  rc=$?
  set -e
  assert_eq_rc 1 "$rc"
}

test_state_dir_subcommand() {
  out=$(bash "$DC_BIN" state-dir)
  expected="$HOME/.claude-devcontainers/$(basename "$PWD")-$(printf '%s' "$PWD" | shasum | cut -c1-6)"
  assert_eq "$expected" "$out" "state-dir output"
}

test_doctor_reports_jq_missing() {
  if command -v jq >/dev/null 2>&1; then
    echo "skip: jq is present on this system"
    return 0
  fi
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "jq: not found" "jq missing line"
  assert_contains "$out" "sandbox-on" "mentions hook dependency"
}

test_doctor_reports_jq_present() {
  stub_bin jq "jq-1.7.1"
  out=$(bash "$DC_BIN" doctor 2>&1)
  assert_contains "$out" "jq:" "jq line present"
}
