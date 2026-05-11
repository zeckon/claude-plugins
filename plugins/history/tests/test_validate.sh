# Validates the on-disk marketplace and plugin manifests against the schema
# Claude Code's plugin loader uses. Catches things the script-level tests
# can't see — hooks.json with the wrong top-level shape, malformed skill
# YAML frontmatter, plugin.json missing required fields, etc.
#
# Requires the `claude` CLI on PATH. If you don't have it locally, install
# Claude Code or delete this file.

test_validate_marketplace_passes() {
  if ! command -v claude >/dev/null 2>&1; then
    echo "FAIL: claude CLI required (install Claude Code or remove this test)"
    return 1
  fi
  local marketplace_root
  marketplace_root="$(cd "$PLUGIN_DIR/../.." && pwd)"
  local out rc
  out=$(claude plugin validate "$marketplace_root" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: claude plugin validate failed at $marketplace_root (rc=$rc)"
    echo "$out"
    return 1
  fi
  assert_contains "$out" "Validation passed" "validator success message"
}
