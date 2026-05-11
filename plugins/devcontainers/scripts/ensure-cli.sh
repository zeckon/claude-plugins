# Sourced helper. Detects the @devcontainers/cli binary, falling back to
# `npx -y @devcontainers/cli` if no global install is found. Callers use
# `dc_run` to invoke the CLI without caring which path was selected.
#
# Exit codes from `dc_ensure_cli`:
#   0  global `devcontainer` on $PATH
#   2  no global, but `npx` is available — will use npx fallback
#   3  no `devcontainer` and no `npx` (Node missing or too old)

# Print the resolved CLI invocation prefix on stdout. Sets DC_CLI_MODE to
# "global" or "npx". Returns one of the codes above.
dc_ensure_cli() {
  if command -v devcontainer >/dev/null 2>&1; then
    DC_CLI_MODE="global"
    printf 'devcontainer\n'
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    DC_CLI_MODE="npx"
    printf 'npx -y @devcontainers/cli\n'
    return 2
  fi
  DC_CLI_MODE="missing"
  return 3
}

# Run the CLI, transparently using the global binary or `npx` fallback.
# Forwards exit code from the CLI. Fails fast (exit 3) if neither is available.
# NOTE: dc_ensure_cli sets DC_CLI_MODE — call it directly (not in a subshell)
# so the assignment is visible here.
dc_run() {
  dc_ensure_cli >/dev/null || true
  case "$DC_CLI_MODE" in
    global) devcontainer "$@" ;;
    npx)    npx -y @devcontainers/cli "$@" ;;
    *)
      echo "devcontainers: no \`devcontainer\` CLI found, and \`npx\` is not available." >&2
      echo "devcontainers: install Node.js (https://nodejs.org) or run /devcontainers:install-cli" >&2
      return 3
      ;;
  esac
}

# Returns 0 if Docker is reachable (daemon is up), 1 otherwise. Suppresses
# all output so callers can use it as a guard.
dc_docker_ok() {
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1
}
