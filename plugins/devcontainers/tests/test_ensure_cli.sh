# Tests for scripts/ensure-cli.sh — CLI detection and npx fallback.

test_ensure_cli_global_present() {
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  stub_bin devcontainer "" 0
  out=$(dc_ensure_cli)
  rc=$?
  assert_eq_rc 0 "$rc"
  assert_eq "devcontainer" "$out" "global prefix"
  assert_eq "global" "$DC_CLI_MODE" "DC_CLI_MODE"
}

test_ensure_cli_npx_fallback() {
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  stub_bin npx "" 0
  out=$(dc_ensure_cli)
  rc=$?
  assert_eq_rc 2 "$rc"
  assert_eq "npx -y @devcontainers/cli" "$out" "npx prefix"
  assert_eq "npx" "$DC_CLI_MODE" "DC_CLI_MODE"
}

test_ensure_cli_neither() {
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  # No stubs added; PATH is restricted to /usr/bin:/bin which has none of
  # devcontainer/npx in CI (in dev these may exist, but the test is in a
  # subshell with $STUB_BIN as the first entry). We rely on neither being
  # present in /usr/bin/{devcontainer,npx} on a clean test env. Skip if
  # they happen to be on system PATH.
  if command -v devcontainer >/dev/null 2>&1; then
    echo "skip: devcontainer is present in /usr/bin or /bin on this system"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    echo "skip: npx is present in /usr/bin or /bin on this system"
    return 0
  fi
  set +e
  dc_ensure_cli >/dev/null
  rc=$?
  set -e
  assert_eq_rc 3 "$rc"
  assert_eq "missing" "$DC_CLI_MODE" "DC_CLI_MODE"
}

test_ensure_cli_dc_run_global() {
  source "$PLUGIN_DIR/scripts/ensure-cli.sh"
  # Stub `devcontainer` to print its args so we can verify dc_run forwarded.
  cat > "$STUB_BIN/devcontainer" <<'EOF'
#!/usr/bin/env bash
echo "stub-devcontainer args: $*"
exit 0
EOF
  chmod +x "$STUB_BIN/devcontainer"
  out=$(dc_run --version 2>&1)
  rc=$?
  assert_eq_rc 0 "$rc"
  assert_contains "$out" "stub-devcontainer args: --version" "forwarded args"
}
