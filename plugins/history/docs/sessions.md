# Multiple sessions on the same project

All Claude Code sessions running in the same `$PWD` write to the **same** shadow repo. This is deliberate — you get one continuous timeline regardless of how many sessions you've run on a project, and a session that resumes (`claude --resume`) keeps the same `session_id` so its commits stay contiguous.

To keep commits from different sessions distinguishable, every shadow commit gets a `Session: <session_id>` trailer in its message.

## Useful queries

Show only commits from a specific session — paste in a `session_id` to scope `log` output to one session:

```bash
bin/history log --grep "Session: <session-id>"
```

List every distinct `session_id` that has touched this shadow repo:

```bash
bin/history log --format='%(trailers:key=Session,valueonly,unfold)' | sort -u
```

Show recent commits with their session id alongside the subject — useful for skimming who-did-what across sessions:

```bash
bin/history log --format='%h %s%n  session: %(trailers:key=Session,valueonly,unfold)' --no-color
```

## Concurrent sessions

If two Claude Code sessions are running on the same workspace at the same time:

- **Prompt attribution is correct.** `UserPromptSubmit` writes the prompt to a session-scoped file (`$GIT_DIR/.last-prompt-<session_id>`), and `Stop` reads the matching one for its session — no cross-session clobbering.
- **Concurrent commits rely on git's index lock.** Two `git commit`s firing within milliseconds of each other contend on `.git/index`. Common case: one waits briefly, both succeed. Rare case: a turn's commit drops. The shadow repo itself stays consistent.

If you need bulletproof concurrent capture (e.g. parallel agents), run them from separate `git worktree` checkouts — a different `$PWD` resolves to a different shadow repo, so there's no contention.
