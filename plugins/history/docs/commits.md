# Commit message structure

Each shadow commit records one Claude turn (one user prompt + Claude's response).

- **Subject** = your prompt (first line, truncated if very long).
- **Body** = full prompt (when multi-line), an excerpt of Claude's response (~1KB), and an Activity block (files changed + tool call summary).
- **Trailers** = git-parseable key/value lines:
  - `Session` — Claude Code session id
  - `Model` — model name
  - `Tokens-In`, `Tokens-Out`
  - `Cache-Read`, `Cache-Created`
  - `Duration`
  - `Tools` — tool call counts
  - `Files-Changed`

Useful for `git log --format='%(trailers:key=Tokens-In,valueonly)'` style queries.

## Full transcript vs excerpt

The body deliberately keeps only an excerpt of Claude's response so commits stay readable. To get the full transcript for any turn — every assistant message, every tool call, every result — use:

```text
/history:transcript <ref>
```

(or `bin/history transcript <ref>`). It reads the `Session` trailer, locates the original Claude Code session JSONL under `~/.claude/projects/`, and pretty-prints every event whose timestamp falls inside the commit's window. If Claude Code has rotated the session log, the command says so.
