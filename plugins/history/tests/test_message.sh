# Tests for scripts/build-message.py — rich commit message builder.

# Helper: invoke build-message.py with given args, return stdout.
build_msg() {
  python3 "$PLUGIN_DIR/scripts/build-message.py" "$@"
}

# Helper: write text to a temp file under $TEST_HOME, echo the path.
write_prompt() {
  local p="$TEST_HOME/prompt-$$"
  printf '%s' "$1" > "$p"
  echo "$p"
}

test_message_falls_back_to_turn_with_no_inputs() {
  local out
  out=$(build_msg)
  assert_eq "turn" "$(echo "$out" | head -1)" "subject is 'turn' fallback"
}

test_message_subject_is_first_line_of_prompt() {
  local pf
  pf=$(write_prompt "fix the failing tests
more detail here")
  local out
  out=$(build_msg --prompt-file "$pf")
  assert_eq "fix the failing tests" "$(echo "$out" | head -1)" "subject is first line"
}

test_message_includes_prompt_section_when_multiline() {
  local pf
  pf=$(write_prompt "subject line
body line one
body line two")
  local out
  out=$(build_msg --prompt-file "$pf")
  assert_contains "$out" "=== Prompt ===" "prompt section header"
  assert_contains "$out" "body line one" "prompt body line in output"
}

test_message_omits_prompt_section_when_single_line() {
  local pf
  pf=$(write_prompt "short prompt")
  local out
  out=$(build_msg --prompt-file "$pf")
  assert_not_contains "$out" "=== Prompt ===" "no redundant prompt section"
}

test_message_emits_session_trailer() {
  local out
  out=$(build_msg --session "abc-123")
  assert_contains "$out" "Session: abc-123" "session trailer"
}

test_message_emits_files_changed_trailer() {
  local out
  out=$(build_msg --files-changed 5)
  assert_contains "$out" "Files-Changed: 5" "files-changed trailer"
}

test_message_extracts_response_and_stats_from_transcript() {
  local tp="$TEST_HOME/transcript.jsonl"
  cat > "$tp" <<'EOF'
{"role":"user","timestamp":"2026-05-09T12:00:00Z","message":{"role":"user","content":"do the thing"}}
{"role":"assistant","timestamp":"2026-05-09T12:00:05Z","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"Working on it now."},{"type":"tool_use","name":"Read","input":{"file_path":"x"}}],"usage":{"input_tokens":1000,"output_tokens":50,"cache_read_input_tokens":900}}}
{"role":"user","timestamp":"2026-05-09T12:00:06Z","message":{"role":"user","content":[{"type":"tool_result","content":"file content"}]}}
{"role":"assistant","timestamp":"2026-05-09T12:00:10Z","message":{"role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"Done!"}],"usage":{"input_tokens":1500,"output_tokens":20}}}
EOF
  local pf
  pf=$(write_prompt "do the thing")
  local out
  out=$(build_msg --transcript "$tp" --session "s1" --prompt-file "$pf" --files-changed 2)

  assert_contains "$out" "=== Response ===" "response section"
  assert_contains "$out" "Done!" "response text from last assistant message"
  assert_contains "$out" "Working on it now." "response text from first assistant message"
  assert_contains "$out" "Tool calls: Read" "tool summary in body"
  assert_contains "$out" "Files changed: 2" "files-changed in body"

  # Trailers
  assert_contains "$out" "Session: s1" "session trailer"
  assert_contains "$out" "Model: claude-opus-4-7" "model trailer"
  assert_contains "$out" "Tokens-In: 2500" "tokens-in summed"
  assert_contains "$out" "Tokens-Out: 70" "tokens-out summed"
  assert_contains "$out" "Cache-Read: 900" "cache-read trailer"
  assert_contains "$out" "Tools: Read" "tools trailer"
  assert_contains "$out" "Duration: 10.0s" "duration"
  assert_contains "$out" "Files-Changed: 2" "files-changed trailer"
}

test_message_truncates_long_response() {
  local tp="$TEST_HOME/transcript.jsonl"
  local long_text
  long_text=$(python3 -c 'print("x" * 2000, end="")')
  python3 -c "
import json, sys
events = [
  {'role':'user','timestamp':'2026-05-09T12:00:00Z','message':{'role':'user','content':'p'}},
  {'role':'assistant','timestamp':'2026-05-09T12:00:01Z','message':{'role':'assistant','model':'claude-opus-4-7','content':[{'type':'text','text':'$long_text'}],'usage':{'input_tokens':1,'output_tokens':1}}},
]
for e in events:
    print(json.dumps(e))
" > "$tp"
  local pf
  pf=$(write_prompt "p")
  local out
  out=$(build_msg --transcript "$tp" --session "s1" --prompt-file "$pf")
  assert_contains "$out" "[truncated;" "truncation marker present"
  # Body should contain at most ~1024 chars of x's, not 2000
  local x_count
  x_count=$(echo "$out" | tr -cd 'x' | wc -c | tr -d ' ')
  if [ "$x_count" -gt 1100 ]; then
    echo "FAIL: response not truncated (found $x_count x's, expected <= ~1024)"
    return 1
  fi
}

test_message_handles_missing_transcript_gracefully() {
  local pf
  pf=$(write_prompt "p")
  local out
  out=$(build_msg --transcript "/no/such/file" --session "s1" --prompt-file "$pf" --files-changed 0)
  assert_eq "p" "$(echo "$out" | head -1)" "subject still set from prompt"
  assert_contains "$out" "Session: s1" "session trailer present"
  assert_not_contains "$out" "=== Response ===" "no response section"
}
