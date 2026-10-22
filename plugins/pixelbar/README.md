# pixelbar

A single-row, full-width pixel-art status strip drawn **under** the Claude Code prompt, in place of the dim hint line.

```
 ▛▜ ▐ MODE AUTO ▌ ▐ DIR claude-plugins ▌ ▐ GIT feat/pixelbar *2 ^2 ▌ ▐ MODEL OPUS 5.5 ▌ ▐ EFFORT ███░░ HIGH ▌ CTX ▆▆▆▆▆▆▆▆▆▆░░░░ 42% 84K/200K TOK ▂▅▃█▆ 5H ▆▆▆░░░ 37% ▐ SESSION 7T 210K $1.23 ▌ ░░░░ ? for shortcuts
```

It is painted as a terminal `Raster` (every cell's character and color set directly) in one of 12 single-hue palettes (Game Boy by default), with a single alert tone for a context window past 80%.

| Part | Shows |
|---|---|
| `▛▜` | A 2-cell pixel walker; it brightens and steps (`▛▜` / `▜▛`) while Claude works |
| `MODE` | `DEFAULT` in the default permission mode. In any other mode Claude Code draws its own mode pill (`⏵⏵ auto mode on`) at the left of this row; the strip makes room for it and shows no tile of its own |
| `DIR` | The session's working folder |
| `GIT` | Branch (or `@sha` when detached), `*N` changed files, `^N` ahead / `vN` behind upstream |
| `MODEL` | The main model, as `/model` names it |
| `EFFORT` | Reasoning effort as pips (`███░░ HIGH`); `AUTO` until known |
| `CTX` | Context window fill gauge, percent, tokens used / window |
| `TOK` | Sparkline of tokens per turn, last 12 turns |
| `5H` | Five-hour rate-limit window used (subscriptions only) |
| `SESSION` | Turns, tokens summed this session, cost in USD |
| right end | The rest of the engine's hint (`? for shortcuts`, `esc to interrupt`) |

On a narrow terminal the least important parts drop out first: `TOK` and `5H`, then `SESSION`, the hint, `MODEL` and `EFFORT`, then `GIT`. Only the terminal draws the strip; the desktop app and other surfaces keep their normal hint line.

## Palettes

Switch with the `/pixelbar-palette` command (it also works while Claude is busy). The choice is remembered across sessions.

| Command | Does |
|---|---|
| `/pixelbar-palette` | The next palette |
| `/pixelbar-palette <name>` | That palette, e.g. `/pixelbar-palette matrix`, `/pixelbar-palette virtual boy` |
| `/pixelbar-palette list` | Lists them, marking the current one |

| id | Palette | Accent | Alert |
|---|---|---|---|
| `gameboy` | Game Boy (default) | olive `#9bbc0f` | `#ff5050` |
| `phosphor` | Green phosphor | `#39ff6a` | amber `#ffb000` |
| `amber` | Amber monitor | `#ffb000` | `#ff3b30` |
| `slate` | Cool slate | ice blue `#7cc4ff` | coral `#ff6b5a` |
| `clay` | Clay | `#d97757` | `#ff5a36` |
| `synthwave` | Synthwave | pink `#ff4fd8` | cyan `#2de2e6` |
| `ocean` | Ocean | teal `#4fe0d0` | `#ff7a59` |
| `ice` | Ice | `#bfe9ff` | `#ff4d6d` |
| `sepia` | Sepia | `#d9b98c` | `#e0533d` |
| `grayscale` | Grayscale | `#e0e0e0` | `#ff4040` |
| `virtualboy` | Virtual Boy | red `#ff2020` | white `#ffffff` |
| `matrix` | Matrix | `#00ff41` | `#ff3b3b` |

Each palette is five shades of one hue (ground, tiles, labels, accent, values) plus the alert color; the two in-between shades are mixed from those.

## Install

```text
/plugin install pixelbar@zeckon-claude-plugins
```

## How it works

pixelbar is a **mod**: a plugin whose `hooks/hooks.json` names a TypeScript hooks module (`hooks/register.tsx`) instead of shell hook scripts. It answers the `PromptHint` render site with a 1-row `Raster` and refreshes its data:

- on session start, after each main-loop turn, and when the engine re-measures usage
- every 15 s, to pick up branch switches and edits made outside Claude

Effort is read from each model request (`turn.step`); before the first one it falls back to the `effortLevel` setting, then `CLAUDE_EFFORT`. The engine's mode pill is drawn outside the strip's site, and the site's hint text then holds only `(shift+tab to cycle)`; the pill's phrase shows in the hint for a moment as the mode changes, so the strip remembers it to know how much room the pill needs. The strip also stops one column short of the terminal's edge, since writing the last column can wrap the row. Text from outside (paths, branch names, the hint) is reduced to printable ASCII, since a raster cell must hold one single-width character.

## Permissions

The strip runs `git status --porcelain=v2 --branch` in the session's folder (read-only, repo hooks off). Nothing leaves the machine.

## Development

```bash
claude plugin validate plugins/pixelbar
claude plugin test plugins/pixelbar    # prints a text preview of the painted strip
claude --plugin-dir plugins/pixelbar   # a session with the mod loaded
```
