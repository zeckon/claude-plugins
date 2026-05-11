#!/usr/bin/env python3
"""Build a rich shadow-history commit message from a Claude Code session
transcript.

Reads the JSONL transcript at --transcript, walks back from the end to the
most recent user message (the start of "this turn"), and extracts:

    - response text (assistant text blocks)
    - tool calls (assistant tool_use blocks)
    - token usage (summed across assistant messages in the turn)
    - model
    - duration (last - first event timestamp)

Emits a commit message of the shape:

    <subject (prompt, truncated)>

    === Prompt ===
    <full prompt>

    === Response ===
    <truncated excerpt>
    [truncated; full transcript via: history transcript <sha>]

    === Activity ===
    Files changed: N
    Tool calls: Read x3, Edit x1

    Session: <id>
    Model: <model>
    Tokens-In: 12453
    Tokens-Out: 678
    Cache-Read: 9800
    Cache-Created: 1200
    Duration: 18.4s
    Tools: Read x3,Edit x1
    Files-Changed: 2

If the transcript is missing or unparseable, falls back to subject + (when
available) Session/Files-Changed trailers.
"""

import argparse
import json
import os
import sys
from datetime import datetime

SUBJECT_TRUNCATE = 120
RESPONSE_TRUNCATE = 1024


def parse_transcript(path):
    if not path or not os.path.isfile(path):
        return []
    events = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return []
    return events


def role_of(ev):
    msg = ev.get("message") or {}
    return msg.get("role") or ev.get("role")


def is_user_prompt(ev):
    """True iff ev is a real user prompt, not a tool_result wrapper.

    Claude Code emits tool_result rounds as role=user messages whose content
    is a list of {"type": "tool_result", ...} blocks. A real prompt has
    content as a string (or a list of text blocks).
    """
    if role_of(ev) != "user":
        return False
    content = (ev.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                return False
        return True
    return False


def find_last_turn(events):
    """Return events from the most recent user prompt onwards.

    Skips role=user events that are tool_result wrappers so the turn window
    spans the entire user-prompt → final-assistant round, including all
    intermediate tool calls.
    """
    for i in range(len(events) - 1, -1, -1):
        if is_user_prompt(events[i]):
            return events[i:]
    return events


def extract_response_text(turn):
    pieces = []
    for ev in turn:
        if role_of(ev) != "assistant":
            continue
        content = (ev.get("message") or {}).get("content", [])
        if isinstance(content, str):
            pieces.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    pieces.append(block.get("text", ""))
    return "\n".join(p for p in pieces if p).strip()


def extract_tools(turn):
    tools = []
    for ev in turn:
        if role_of(ev) != "assistant":
            continue
        content = (ev.get("message") or {}).get("content", []) or []
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                tools.append(block.get("name", "?"))
    return tools


def extract_usage(turn):
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    model = None
    for ev in turn:
        if role_of(ev) != "assistant":
            continue
        msg = ev.get("message") or {}
        if not model and msg.get("model"):
            model = msg["model"]
        usage = msg.get("usage") or {}
        for k in totals:
            v = usage.get(k)
            if isinstance(v, int):
                totals[k] += v
    return model, totals


def extract_duration(turn):
    timestamps = [ev.get("timestamp") for ev in turn if ev.get("timestamp")]
    if len(timestamps) < 2:
        return None
    try:
        first = datetime.fromisoformat(timestamps[0].replace("Z", "+00:00"))
        last = datetime.fromisoformat(timestamps[-1].replace("Z", "+00:00"))
        return (last - first).total_seconds()
    except (ValueError, AttributeError):
        return None


def fmt_tools(tools):
    if not tools:
        return ""
    counts = {}
    order = []
    for t in tools:
        if t not in counts:
            order.append(t)
        counts[t] = counts.get(t, 0) + 1
    return ", ".join(f"{name} x{counts[name]}" if counts[name] > 1 else name for name in order)


def read_prompt(prompt_file):
    if not prompt_file or not os.path.isfile(prompt_file):
        return ""
    try:
        with open(prompt_file, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--transcript", default="")
    ap.add_argument("--session", default="")
    ap.add_argument("--prompt-file", default="")
    ap.add_argument("--files-changed", type=int, default=-1)
    args = ap.parse_args()

    prompt = read_prompt(args.prompt_file).rstrip("\n")
    if not prompt:
        prompt = "turn"

    subject_src = prompt.split("\n", 1)[0]
    if len(subject_src) > SUBJECT_TRUNCATE:
        subject = subject_src[: SUBJECT_TRUNCATE - 1] + "..."
    else:
        subject = subject_src

    events = parse_transcript(args.transcript)
    turn = find_last_turn(events) if events else []
    response = extract_response_text(turn) if turn else ""
    tools = extract_tools(turn) if turn else []
    model, usage = extract_usage(turn) if turn else (None, {})
    duration = extract_duration(turn) if turn else None

    lines = [subject]
    body_started = False

    def begin_body():
        nonlocal body_started
        if not body_started:
            lines.append("")
            body_started = True

    if prompt and prompt != subject:
        begin_body()
        lines.append("=== Prompt ===")
        lines.append(prompt)
        lines.append("")

    if response:
        begin_body()
        lines.append("=== Response ===")
        if len(response) > RESPONSE_TRUNCATE:
            lines.append(response[:RESPONSE_TRUNCATE])
            lines.append("[truncated; full transcript via: history transcript <sha>]")
        else:
            lines.append(response)
        lines.append("")

    activity = []
    if args.files_changed >= 0:
        activity.append(f"Files changed: {args.files_changed}")
    if tools:
        activity.append(f"Tool calls: {fmt_tools(tools)}")
    if activity:
        begin_body()
        lines.append("=== Activity ===")
        lines.extend(activity)
        lines.append("")

    trailers = []
    if args.session:
        trailers.append(f"Session: {args.session}")
    if model:
        trailers.append(f"Model: {model}")
    if usage.get("input_tokens"):
        trailers.append(f"Tokens-In: {usage['input_tokens']}")
    if usage.get("output_tokens"):
        trailers.append(f"Tokens-Out: {usage['output_tokens']}")
    if usage.get("cache_read_input_tokens"):
        trailers.append(f"Cache-Read: {usage['cache_read_input_tokens']}")
    if usage.get("cache_creation_input_tokens"):
        trailers.append(f"Cache-Created: {usage['cache_creation_input_tokens']}")
    if duration is not None:
        trailers.append(f"Duration: {duration:.1f}s")
    if tools:
        trailers.append(f"Tools: {fmt_tools(tools)}")
    if args.files_changed >= 0:
        trailers.append(f"Files-Changed: {args.files_changed}")

    if trailers:
        begin_body()
        lines.extend(trailers)

    sys.stdout.write("\n".join(lines))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
