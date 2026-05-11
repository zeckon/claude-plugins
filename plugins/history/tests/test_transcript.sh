# Tests for `bin/history transcript <ref>` — pulls the full Claude Code
# transcript for the turn that produced a given commit.

test_transcript_errors_on_unknown_ref() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s1" "first"
  run_commit "s1"
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" transcript "doesnotexist" 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit for unknown ref"
    return 1
  fi
  assert_contains "$out" "unknown ref" "error message"
}

test_transcript_errors_when_no_repo() {
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" transcript HEAD 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when repo missing"
    return 1
  fi
  assert_contains "$out" "no shadow-history repo" "error message"
}

test_transcript_requires_ref_arg() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "s1" "first"
  run_commit "s1"
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" transcript 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when ref missing"
    return 1
  fi
  assert_contains "$out" "usage: history transcript" "usage message"
}

test_transcript_reports_missing_session_trailer() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  # Make a commit without a Session trailer by committing directly.
  echo "v1" > file.txt
  git --git-dir="$(shadow_dir)" --work-tree="$PWD" add --all
  git --git-dir="$(shadow_dir)" --work-tree="$PWD" commit \
    --allow-empty -m "no trailer here" --quiet
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" transcript HEAD 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when no Session trailer"
    return 1
  fi
  assert_contains "$out" "no Session trailer" "trailer-missing message"
}

test_transcript_reports_when_jsonl_file_missing() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null
  echo "v1" > file.txt
  run_init "missing-session" "first"
  run_commit "missing-session"
  # Don't create the transcript file.
  local out rc
  out=$(bash "$PLUGIN_DIR/bin/history" transcript HEAD 2>&1) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "FAIL: expected non-zero exit when transcript file missing"
    return 1
  fi
  assert_contains "$out" "transcript file not found" "missing-jsonl message"
}

test_transcript_pretty_prints_events_in_window() {
  bash "$PLUGIN_DIR/bin/history" enable >/dev/null

  # First turn: create file. We'll put events for this turn in the JSONL.
  local tp
  tp=$(make_transcript "sess-T" "$PWD" <<'EOF'
{"role":"user","timestamp":"2026-05-09T12:00:00Z","message":{"role":"user","content":"please add a readme"}}
{"role":"assistant","timestamp":"2026-05-09T12:00:05Z","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"Adding the readme now."},{"type":"tool_use","name":"Write","input":{"file_path":"README.md","content":"hi"}}],"usage":{"input_tokens":100,"output_tokens":20}}}
EOF
)
  echo "v1" > readme.txt
  run_init "sess-T" "please add a readme"
  run_commit "sess-T" "$tp"

  local out
  out=$(bash "$PLUGIN_DIR/bin/history" transcript HEAD 2>&1)
  assert_contains "$out" "=== Events in this turn ===" "header present"
  assert_contains "$out" "please add a readme" "user prompt visible"
  assert_contains "$out" "Adding the readme now." "assistant text visible"
  assert_contains "$out" "Write(" "tool call visible"
  assert_contains "$out" "Session: sess-T" "trailer summary"
}
