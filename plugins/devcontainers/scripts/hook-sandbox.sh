#!/usr/bin/env bash
# PreToolUse hook for the Bash tool. When sandbox mode is enabled for the
# current workspace, non-allowlisted commands get rewritten to run inside the
# active dev container (or a chosen compose service), so the agent operates
# inside the container rather than on the host.
#
# Wire-up: hooks/hooks.json registers this script for matcher "Bash". On every
# Bash tool call Claude Code pipes the event JSON to stdin and reads our stdout.
# Per the Claude Code hooks protocol, exit 0 + JSON of the form
#
#   {"hookSpecificOutput": {
#      "hookEventName": "PreToolUse",
#      "permissionDecision": "allow",
#      "updatedInput": {"command": "<rewritten>"}}}
#
# replaces tool_input.command with the rewritten one. Exit 0 with no output
# leaves the original command unchanged. (See https://code.claude.com/docs/en/hooks.md)
#
# Behavior:
#   1. Off when $DC_STATE_DIR/sandbox-enabled is missing → exit 0 silently.
#   2. Only acts on tool_name == "Bash".
#   3. First-token allowlist of host commands stays on the host; everything
#      else is wrapped in `<plugin-root>/bin/devcontainers exec [--service S] --
#      bash -lc <quoted-original>`.
#
# Failure mode: any internal error → exit 0 with no output (= no rewrite). The
# user sees the original command run on the host rather than a broken hook
# blocking every Bash call.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_paths.sh"

# Off by default — the flag file is only created by /devcontainers:sandbox-on.
# Check this BEFORE consuming stdin or invoking jq: the hook fires on every
# Bash tool call, so the common case (sandbox off) needs to be a single stat
# rather than two forks.
[ -f "$DC_STATE_DIR/sandbox-enabled" ] || exit 0

# Read event JSON from stdin (may be empty if invoked outside Claude Code).
EVENT=$(cat 2>/dev/null || true)
[ -n "$EVENT" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME=$(printf '%s' "$EVENT" | jq -r '.tool_name // empty' 2>/dev/null)
# Defensive: matcher in hooks.json anchors to ^Bash$, but be explicit so the
# hook is robust against config drift or BashOutput-style sibling tools.
[ "$TOOL_NAME" = "Bash" ] || exit 0

CMD=$(printf '%s' "$EVENT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$CMD" ] || exit 0

# First-token allowlist. Host-side tooling that should never be containerized:
# version control, container CLIs themselves, navigation, simple inspection.
# `bash` and `npx` need stricter checks (below) since they can launch arbitrary
# code; allowlisting them unconditionally would defeat the sandbox.
read -r FIRST _ <<< "$CMD"

case "$FIRST" in
  git|gh|devcontainer|docker|docker-compose|claude|code|cd|pwd|echo|mkdir|ls|cat|which|command)
    exit 0
    ;;
  bash)
    # Allow `bash <plugin-root>/...` — that's how every plugin skill invokes
    # the wrapper, and rewriting them would create a routing loop.
    if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [[ "$CMD" == *"${CLAUDE_PLUGIN_ROOT}"* ]]; then
      exit 0
    fi
    ;;
  npx)
    if [[ "$CMD" == *"@devcontainers/cli"* ]]; then
      exit 0
    fi
    ;;
esac

# CLAUDE_PLUGIN_ROOT is set by Claude Code when invoking a plugin's hooks. In
# tests we set it explicitly. Fall back to deriving it from this script's path
# (scripts/hook-sandbox.sh → plugin root one level up).
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WRAPPER="$PLUGIN_ROOT/bin/devcontainers"

SERVICE=""
if [ -f "$DC_STATE_DIR/sandbox-service" ]; then
  SERVICE=$(head -n1 "$DC_STATE_DIR/sandbox-service" 2>/dev/null | tr -d '\r\n')
fi

# %q produces a backslash-escaped form that round-trips through bash word
# splitting back to the original string. We quote every interpolated value
# (wrapper path may contain spaces on macOS plugin installs; service name
# could in principle contain shell metacharacters via a malformed state file)
# so the rewritten command tokenizes to exactly the argv we intend.
QUOTED_CMD=$(printf '%q' "$CMD")
QUOTED_WRAPPER=$(printf '%q' "$WRAPPER")

if [ -n "$SERVICE" ]; then
  QUOTED_SERVICE=$(printf '%q' "$SERVICE")
  NEW_CMD="$QUOTED_WRAPPER exec --service $QUOTED_SERVICE -- bash -lc $QUOTED_CMD"
else
  NEW_CMD="$QUOTED_WRAPPER exec -- bash -lc $QUOTED_CMD"
fi

jq -n --arg cmd "$NEW_CMD" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: { command: $cmd }
  }
}'
