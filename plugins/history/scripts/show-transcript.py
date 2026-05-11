#!/usr/bin/env python3
"""Pretty-print the Claude Code transcript events that produced a given
shadow-history commit.

Reads the Session trailer from the commit message, locates the matching
~/.claude/projects/<encoded-cwd>/<session>.jsonl (with a brute-force scan
across project dirs as a fallback), and prints all events whose timestamp
falls between the parent commit and this commit.

Usage: invoked by `bin/history transcript <ref>` after the wrapper has
resolved $GIT_DIR and $PWD.
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TOOL_INPUT_TRUNCATE = 240
TOOL_RESULT_TRUNCATE = 400


def run_git(git_dir, *args):
    return subprocess.check_output(
        ["git", f"--git-dir={git_dir}"] + list(args), stderr=subprocess.DEVNULL
    ).decode("utf-8").rstrip("\n")


def parse_trailers(commit_msg):
    """Pull "Key: value" lines out of the trailer block at the end of msg."""
    out = {}
    for line in reversed(commit_msg.split("\n")):
        if not line.strip():
            if out:
                break
            continue
        if ":" in line and not line.startswith((" ", "\t")):
            key, _, value = line.partition(":")
            out[key.strip()] = value.strip()
        else:
            break
    return out


def find_transcript(session_id, workspace):
    base = Path(os.path.expanduser("~/.claude/projects"))
    if not base.exists() or not session_id:
        return None
    target = f"{session_id}.jsonl"
    if workspace:
        encoded = workspace.replace("/", "-")
        candidate = base / encoded / target
        if candidate.is_file():
            return candidate
    for project_dir in base.iterdir():
        if not project_dir.is_dir():
            continue
        candidate = project_dir / target
        if candidate.is_file():
            return candidate
    return None


def parse_ts(ts_str):
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return None


def role_of(ev):
    msg = ev.get("message") or {}
    return msg.get("role") or ev.get("role") or "?"


def render_event(ev):
    role = role_of(ev)
    ts = ev.get("timestamp", "")
    print(f"\n[{ts}] {role}")
    msg = ev.get("message") or {}
    content = msg.get("content", "")
    if isinstance(content, str):
        print(content.rstrip())
        return
    if not isinstance(content, list):
        return
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            text = (block.get("text") or "").rstrip()
            if text:
                print(text)
        elif btype == "tool_use":
            name = block.get("name", "?")
            inp = block.get("input", {})
            blob = json.dumps(inp, ensure_ascii=False)
            if len(blob) > TOOL_INPUT_TRUNCATE:
                blob = blob[:TOOL_INPUT_TRUNCATE] + "..."
            print(f"  -> {name}({blob})")
        elif btype == "tool_result":
            tr = block.get("content", "")
            if isinstance(tr, list):
                tr = " ".join(
                    (b.get("text") or "") if isinstance(b, dict) else str(b) for b in tr
                )
            tr = str(tr).rstrip()
            if len(tr) > TOOL_RESULT_TRUNCATE:
                tr = tr[:TOOL_RESULT_TRUNCATE] + "..."
            if tr:
                print(f"  <- {tr}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--git-dir", required=True)
    ap.add_argument("--workspace", required=True)
    ap.add_argument("ref")
    args = ap.parse_args()

    try:
        sha = run_git(args.git_dir, "rev-parse", args.ref)
    except subprocess.CalledProcessError:
        print(f"history: unknown ref: {args.ref}", file=sys.stderr)
        sys.exit(1)

    commit_msg = run_git(args.git_dir, "log", "-1", "--format=%B", sha)
    commit_ts = int(run_git(args.git_dir, "log", "-1", "--format=%ct", sha))
    try:
        parent_ts = int(run_git(args.git_dir, "log", "-1", "--format=%ct", f"{sha}~1"))
    except subprocess.CalledProcessError:
        parent_ts = 0

    trailers = parse_trailers(commit_msg)
    session = trailers.get("Session")
    subject = commit_msg.split("\n", 1)[0]

    print(f"Commit: {sha[:12]}")
    print(f"Subject: {subject}")
    if session:
        print(f"Session: {session}")
    if trailers.get("Model"):
        print(f"Model: {trailers['Model']}")
    if trailers.get("Tokens-In") or trailers.get("Tokens-Out"):
        ti = trailers.get("Tokens-In", "?")
        to = trailers.get("Tokens-Out", "?")
        print(f"Tokens: in={ti} out={to}")
    if trailers.get("Duration"):
        print(f"Duration: {trailers['Duration']}")

    if not session:
        print("\nhistory: no Session trailer; cannot locate transcript", file=sys.stderr)
        sys.exit(1)

    transcript = find_transcript(session, args.workspace)
    if transcript is None:
        print(
            "\nhistory: transcript file not found under ~/.claude/projects/",
            file=sys.stderr,
        )
        print(
            "history: Claude Code may have rotated or deleted this session's log",
            file=sys.stderr,
        )
        sys.exit(2)

    print(f"Transcript: {transcript}")
    print()
    print("=== Events in this turn ===")

    # Window: (parent_ts, commit_ts]. Add a 1s buffer for clock skew.
    lo = parent_ts
    hi = commit_ts + 1

    shown = 0
    with open(transcript, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = parse_ts(ev.get("timestamp"))
            if ts is None:
                continue
            if ts <= lo or ts > hi:
                continue
            render_event(ev)
            shown += 1

    if shown == 0:
        print("(no events found in the commit's timestamp window)")


if __name__ == "__main__":
    main()
