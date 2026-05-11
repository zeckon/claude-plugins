#!/usr/bin/env bash
# Test runner for the devcontainers plugin.
#
# Discovers `test_*` functions in every tests/test_*.sh file and runs each one
# in its own subshell with a fresh isolated $HOME (via setup_test_env). Output
# is suppressed on success; printed on failure.
#
#   bash plugins/devcontainers/tests/run-tests.sh
#
# Exit code: 0 if all tests passed, 1 otherwise.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PLUGIN_DIR="$(dirname "$TESTS_DIR")"

PASS=0
FAIL=0
FAILED=()

shopt -s nullglob
for test_file in "$TESTS_DIR"/test_*.sh; do
  base=$(basename "$test_file" .sh)

  fns=$(bash -c "
    set -e
    source '$TESTS_DIR/lib/helpers.sh'
    source '$test_file'
    compgen -A function | grep '^test_' | sort
  " 2>/dev/null)

  if [ -z "$fns" ]; then
    echo "  (no test_* functions found in $base)"
    continue
  fi

  for fn in $fns; do
    label="$base::$fn"
    out=$(mktemp)
    if (
      set -e
      source "$TESTS_DIR/lib/helpers.sh"
      source "$test_file"
      setup_test_env
      "$fn"
    ) >"$out" 2>&1; then
      printf '  %s  %s\n' "PASS" "$label"
      PASS=$((PASS + 1))
    else
      printf '  %s  %s\n' "FAIL" "$label"
      sed 's/^/      /' "$out"
      FAIL=$((FAIL + 1))
      FAILED+=("$label")
    fi
    rm -f "$out"
  done
done

echo
echo "==== $PASS passed, $FAIL failed ===="
if [ "$FAIL" -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
