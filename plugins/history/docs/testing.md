# Tests

```bash
bash plugins/history/tests/run-tests.sh
```

The suite is plain bash — no test framework dependency. Each test runs in its own subshell with an isolated `$HOME` (a tmp dir under `/tmp/history-test-*`) so it cannot see or touch real shadow repos under `~/.claude-history/`. Cleanup runs via an `EXIT` trap so leaked tmp dirs don't accumulate even on failure.

## Coverage

| File | What it covers |
| --- | --- |
| `tests/test_paths.sh` | Path resolution: hash determinism, distinct PWDs → distinct repos, same basename in different parent dirs doesn't collide. |
| `tests/test_hooks.sh` | `hook-init` (repo creation, exclude file, workspace marker, per-session prompt files, idempotence, malformed JSON, missing session_id) and `hook-commit` (commit subject = prompt, Session trailer, "turn" fallback, no-op when no repo, exclude rules apply). Includes the **multi-session attribution** test — the regression test for the v0.1 prompt-mismatch race. |
| `tests/test_wrapper.sh` | `bin/history`: errors when no repo, forwards `log`/`show`/`diff` to git correctly. |
| `tests/test_admin.sh` | `bin/history-admin`: help, unknown-command rejection, `list` (empty + populated), `gc` preserves history, `prune-orphan` dry-run vs real, `prune-orphan` deletes orphans without touching alive repos, `remove` (incl. path-traversal rejection), `prune-old` validation. |
| `tests/test_e2e.sh` | Full lifecycle: three turns → diff between turns → restore from old ref. Session filtering via `--grep "Session: <id>"` and distinct-sessions extraction via `%(trailers:key=Session,valueonly,unfold)`. |
| `tests/test_optin.sh` | Opt-in flow: hooks no-op when not enabled, `enable` registers + creates repo, `disable`/`pause` unregister but preserve repo, `status` output, re-enable resumes capture, wrapper hints `enable` when not opted in. |
| `tests/test_validate.sh` | Runs `claude plugin validate` against the marketplace root. Catches manifest, `hooks/hooks.json`, and skill-frontmatter schema errors that the script-level tests can't see (they bypass the plugin loader). Requires the `claude` CLI on PATH. |
| `tests/test_message.sh` | `build-message.py`: subject derivation, prompt-section omitted when single-line, response excerpt + truncation, all trailers (Session, Model, Tokens-*, Cache-*, Duration, Tools, Files-Changed), graceful fallback when transcript missing. |
| `tests/test_transcript.sh` | `bin/history transcript`: unknown ref, missing repo/ref-arg, missing Session trailer, missing JSONL file, and end-to-end pretty-print with a synthetic transcript. |
| `tests/test_remote.sh` | Remote sync: `remote` set/show/clear, `push-enable` privacy gate + ack persistence, `push-disable`, manual `push` to a local bare-repo remote, `pull`, `clone` bootstrap (incl. refusing over an existing repo), `status` extension, and the hook's detached auto-push. |

To add a test: drop a `test_*` function into any `tests/test_*.sh` file. The runner discovers them automatically via `compgen -A function`.
