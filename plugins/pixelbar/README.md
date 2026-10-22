# pixelbar

A two-row, full-width pixel-art status strip drawn **under** the Claude Code prompt, in place of the dim hint line.

```
  ▄▀▀▀▄  ▐ DIR  claude-plugins ▌ ▐ GIT  feat/pixelbar *2 ^2 ▌ ▐ MODEL  OPUS 5.5 ▌ ▐ EFFORT  ███░░ HIGH ▌ ▐ SESSION  7 TURNS $1.23 ▌ ▓▓▓▒▒▒░░░
 ▀▀▀▀▀▀▀ CTX ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆ 42% 84K/200K  TOK ▂▅▃█▆  5H ▆▆▆▆▆▆▆▆ 37%                       ? for shortcuts
```

It is painted as a terminal `Raster` (every cell's character and color set directly), in the PICO-8 palette.

**Row 1: pixel tiles**

| Tile | Shows |
|---|---|
| `DIR` | The session's working folder |
| `GIT` | Branch (or `@sha` when detached), `*N` changed files, `^N` ahead / `vN` behind upstream |
| `MODEL` | The main model, as `/model` names it |
| `EFFORT` | Reasoning effort as pips (`███░░ HIGH`); `AUTO` until known |
| `SESSION` | Turns, tokens summed this session, cost in USD |

**Row 2: gauges**

| Gauge | Shows |
|---|---|
| `CTX` | Context window fill, a green → yellow → red gradient bar, with percent and tokens used / window |
| `TOK` | Sparkline of tokens per turn, last 16 turns |
| `5H` | Five-hour rate-limit window used (subscriptions only) |
| right end | The engine's own hint (`? for shortcuts`, `esc to interrupt`, mode pills) as plain text |

The invader on the left is green when idle and turns orange and walks while Claude is working.

On a narrow terminal the least important tiles (`SESSION`, `EFFORT`, then the rest from the right) drop out, then the `5H` gauge and the sparkline. Only the terminal draws the strip; the desktop app and other surfaces keep their normal hint line.

## Install

```text
/plugin install pixelbar@zeckon-claude-plugins
```

## How it works

pixelbar is a **mod**: a plugin whose `hooks/hooks.json` names a TypeScript hooks module (`hooks/register.tsx`) instead of shell hook scripts. It answers the `PromptHint` render site with a 2-row `Raster` and refreshes its data:

- on session start, after each main-loop turn, and when the engine re-measures usage
- every 15 s, to pick up branch switches and edits made outside Claude

Effort is read from each model request (`turn.step`); before the first one it falls back to the `effortLevel` setting, then `CLAUDE_EFFORT`. Text from outside (paths, branch names, the hint) is reduced to printable ASCII, since a raster cell must hold one single-width character.

## Permissions

The strip runs `git status --porcelain=v2 --branch` in the session's folder (read-only, repo hooks off). Nothing leaves the machine.

## Development

```bash
claude plugin validate plugins/pixelbar
claude plugin test plugins/pixelbar    # prints a text preview of the painted strip
claude --plugin-dir plugins/pixelbar   # a session with the mod loaded
```
