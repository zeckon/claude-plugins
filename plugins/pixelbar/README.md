# pixelbar

A pixel-art status band drawn just above the Claude Code prompt.

```
 ▄█▄▄█▄  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 █▀██▀██  DIR  claude-plugins    GIT  feat/pixelbar *2 ^1   MODEL  OPUS 5.5   …
 ▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

Each fact is a raised pixel tile in a PICO-8 color:

| Tile | Shows |
|---|---|
| `DIR` | The session's working folder |
| `GIT` | Branch (or `@sha` when detached), `*N` changed files, `^N` ahead / `vN` behind upstream |
| `MODEL` | The main model, as `/model` names it |
| `EFFORT` | Reasoning effort as pips (`■■■□□ HIGH`); `AUTO` until known |
| `CTX` | Context window fill bar, percent, tokens used / window (bar turns red at 80%) |
| `TOKENS` | Last turn: input (incl. cache), output, cache-read |
| `SESSION` | Turns, output tokens summed this session, cost in USD |
| `5H` | Five-hour rate-limit window used (subscriptions only) |

The invader on the left is green when idle and turns orange and walks while Claude is working.

When the terminal is narrow, the tiles wrap onto a second line, then the least important ones (`5H`, `TOKENS`, `SESSION`, `EFFORT`) drop out first. Collapse the band with its `[-]` mark.

## Install

```text
/plugin install pixelbar@zeckon-claude-plugins
```

## How it works

pixelbar is a **mod**: a plugin whose `hooks/hooks.json` names a TypeScript hooks module (`hooks/register.tsx`) instead of shell hook scripts. It draws the `AbovePrompt` band and refreshes its data:

- on session start, after each main-loop turn, and when the engine re-measures usage
- every 15 s, to pick up branch switches and edits made outside Claude

Effort is read from each model request (`turn.step`); before the first one it falls back to the `effortLevel` setting, then `CLAUDE_EFFORT`.

## Permissions

The band runs `git status --porcelain=v2 --branch` in the session's folder (read-only, repo hooks off). Nothing leaves the machine.

## Development

```bash
claude plugin validate plugins/pixelbar
claude plugin test plugins/pixelbar
claude --plugin-dir plugins/pixelbar   # a session with the mod loaded
```
