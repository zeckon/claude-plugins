#!/usr/bin/env bash
# UserPromptSubmit hook: silent no-op unless this workspace has been opted in
# via `history enable`. When enabled, ensure the shadow repo exists and capture
# the prompt text under a session-scoped filename so concurrent sessions on the
# same workspace don't clobber each other's prompts before their Stop hooks
# fire.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_paths.sh"

history_is_enabled || exit 0

command -v git >/dev/null 2>&1 || { echo "history: git not found on PATH" >&2; exit 0; }

history_init_repo

# Read the JSON payload once, write the prompt to a per-session file.
HIST_GIT_DIR="$GIT_DIR" python3 -c '
import json, os, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = {}
session = data.get("session_id") or "unknown"
out = os.path.join(os.environ["HIST_GIT_DIR"], ".last-prompt-" + session)
with open(out, "w") as f:
    f.write(data.get("prompt", ""))
' 2>/dev/null || true

exit 0
