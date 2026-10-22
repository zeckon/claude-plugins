# pixelbar

A single-row, full-width, pixel-art status strip drawn **under** the Claude Code prompt. It shows what you'd otherwise have to ask for: where you are, which branch, which model and effort, how full the context window is, what the session has cost, and which permission mode you're in.

```
 ▛▜ ▐ MODE DEFAULT ▌ ▐ DIR claude-plugins ▌ ▐ GIT feat/pixelbar *2 ^2 ▌ ▐ MODEL OPUS 5.5 ▌ ▐ EFFORT ███░░ HIGH ▌ CTX ▆▆▆▆▆▆▆▆░░░░ 42% 84K/200K TOK ▂▅▃█▆ 5H ▆▆▆░░░ 37% ▐ SESSION 7T 210K $1.23 ▌ ░░░░ ? for shortcuts
```

In your terminal it is drawn in color, in one of [12 palettes](#palettes) (Game Boy greens by default).

## Contents

- [Install](#install)
- [The strip, section by section](#the-strip-section-by-section)
- [Narrow terminals](#narrow-terminals)
- [Palettes](#palettes)
- [Permissions and privacy](#permissions-and-privacy)
- [Limitations](#limitations)
- [How it works](#how-it-works)
- [Development](#development)

## Install

pixelbar is a **mod**, a plugin written as a TypeScript hooks module. It needs a Claude Code build with the mods (function hooks) API; it was built and tested on **Claude Code 2.1.308**. Check yours with `claude --version`.

**1. Register the marketplace** (once per Claude Code install; skip it if you already added it for another plugin from this repo):

```text
/plugin marketplace add zeckon/claude-plugins
```

**2. Install the plugin:**

```text
/plugin install pixelbar@zeckon-claude-plugins
```

Pick the **user** scope to have the strip in every project. The strip appears under the prompt right away, with no restart. If it doesn't, run `/reload-plugins`.

**3. Check it works:** the dim `? for shortcuts` line under the prompt is replaced by the strip, and `/pixelbar-palette` shows up when you type `/pix`.

**Update** to the latest version:

```text
/plugin marketplace update zeckon-claude-plugins
/plugin update pixelbar@zeckon-claude-plugins
```

**Uninstall** (the normal hint line comes back):

```text
/plugin uninstall pixelbar@zeckon-claude-plugins
```

**Try it without installing**, from a clone of this repo:

```bash
claude --plugin-dir plugins/pixelbar
```

## The strip, section by section

From left to right.

### Walker `▛▜`

A tiny 2-cell pixel creature built from quarter-block characters. It sits still in a muted shade while Claude is idle. While Claude works on a turn it lights up in the palette's accent color and walks, switching between `▛▜` (legs out) and `▜▛` (legs in) about three times a second. If it's walking, Claude is busy.

### `MODE`: permission mode

Shows `MODE DEFAULT` when you're in the default permission mode.

In any other mode (auto, plan, accept edits, bypass permissions), Claude Code draws its own mode indicator, for example `⏵⏵ auto mode on`, at the very left of this row. Mods can't hide it, so the strip moves over to make room and skips its own `MODE` tile. The indicator then reads as the strip's first section. Cycle modes with **shift+tab** as usual.

### `DIR`: working folder

The last folder of the session's working directory, for example `claude-plugins`. Names longer than 24 characters are cut and end in `~`.

### `GIT`: branch and working-tree state

Shown only inside a git repository.

| Shows | Means |
|---|---|
| `feat/pixelbar` | The current branch (cut at 28 characters) |
| `@1a2b3c4` | A detached HEAD, by its short commit hash |
| `*2` | 2 files changed or untracked |
| `^2` | 2 commits ahead of the upstream branch (not pushed yet) |
| `v1` | 1 commit behind the upstream branch (not pulled yet) |

It refreshes after every turn and every 15 seconds, so branch switches and edits you make outside Claude show up too.

### `MODEL`: the main model

The model the conversation runs on, as `/model` names it, shortened: `claude-opus-5-5` shows as `OPUS 5.5`, and a 1M-context variant gets ` 1M` added.

### `EFFORT`: reasoning effort

How hard the model is set to think, as five pips and a word:

| Shows | Level |
|---|---|
| `█░░░░ LOW` | low |
| `██░░░ MEDIUM` | medium |
| `███░░ HIGH` | high |
| `████░ XHIGH` | xhigh |
| `█████ MAX` | max |
| `AUTO` | Not known yet, or the model has no effort setting |

The exact value is read from each request Claude sends. Before the first one in a session, it falls back to the `effortLevel` setting, then the `CLAUDE_EFFORT` environment variable.

### `CTX`: context window

How full the conversation's context window is:

- **Gauge:** fills left to right, shading from dim to the accent color as it grows.
- **Percent:** for example `42%`.
- **Tokens:** used / window size, for example `84K/200K`.

At **80% or more**, the filled gauge and the numbers switch to the palette's alert color. That's a cue to `/compact` or start fresh soon.

### `TOK`: tokens per turn

A sparkline (`▁▂▃▄▅▆▇█`) of the tokens each of your last 12 turns used (input, cache and output together), oldest on the left. Bars are scaled to the biggest turn shown, so a tall bar means "an expensive turn compared with the others". Hidden until the first turn completes.

### `5H`: five-hour usage limit

How much of your five-hour rate-limit window is used, as a small gauge and a percent. Shown only on a Claude subscription that reports one. It turns to the alert color at 90%.

### `SESSION`: session totals

| Shows | Means |
|---|---|
| `7T` | 7 prompts sent this session |
| `210K` | Tokens used this session, summed over turns (input + output) |
| `$1.23` | The session's cost so far, as `/cost` reports it |

### Hint (right end)

What's left of Claude Code's own hint line, in a dim shade: `? for shortcuts`, `esc to interrupt` while Claude works, and so on. The `(shift+tab to cycle)` reminder that comes with the mode indicator is left out to save space.

### Trail `░░░`

A faint dithered pixel trail that fills any space left between the sections and the hint, so the strip always spans the full width.

## Narrow terminals

Everything stays on one row. When it doesn't fit, the least important sections drop out, in this order:

1. `TOK` and `5H`
2. `SESSION`
3. The hint text
4. `MODEL` and `EFFORT`
5. `GIT`

The walker, `MODE`, `DIR` and `CTX` stay. The strip always stops one column short of the terminal's right edge, because writing into the last column can make some terminals wrap and leave an empty line.

Only the terminal draws the strip. The desktop app, IDE extensions and mobile keep their normal hint line.

## Palettes

Each palette is one hue, from dark to light, plus a single alert color for warnings. Switch with the `/pixelbar-palette` command. It works even while Claude is busy, and your choice is remembered for future sessions.

| Command | Does |
|---|---|
| `/pixelbar-palette` | Switches to the next palette (after the last, back to the first) |
| `/pixelbar-palette <name>` | Switches to that palette; spelling is loose: `matrix`, `virtual boy`, `GameBoy`, `syn` |
| `/pixelbar-palette list` | Lists all palettes and marks the current one with `>` |

| id | Palette | Feel | Accent | Alert |
|---|---|---|---|---|
| `gameboy` | Game Boy (default) | The original Game Boy's olive greens | `#9bbc0f` | `#ff5050` |
| `phosphor` | Green phosphor | CRT terminal | `#39ff6a` | amber `#ffb000` |
| `amber` | Amber monitor | 80s amber screen | `#ffb000` | `#ff3b30` |
| `slate` | Cool slate | Calm blue-grey | ice blue `#7cc4ff` | coral `#ff6b5a` |
| `clay` | Clay | Warm terracotta | `#d97757` | `#ff5a36` |
| `synthwave` | Synthwave | Neon purple night | pink `#ff4fd8` | cyan `#2de2e6` |
| `ocean` | Ocean | Deep teal | `#4fe0d0` | `#ff7a59` |
| `ice` | Ice | Pale, almost white | `#bfe9ff` | `#ff4d6d` |
| `sepia` | Sepia | Old photo, soft brown | `#d9b98c` | `#e0533d` |
| `grayscale` | Grayscale | Pure black and white | `#e0e0e0` | `#ff4040` |
| `virtualboy` | Virtual Boy | Red on black | `#ff2020` | white `#ffffff` |
| `matrix` | Matrix | Black and bright green | `#00ff41` | `#ff3b3b` |

Each palette defines five shades (ground, tiles, labels, accent, values) plus the alert color. Two in-between shades, for empty gauge cells and dim text, are mixed from those. Colors are 24-bit, so a terminal with true-color support shows them best.

## Permissions and privacy

- The strip runs `git status --porcelain=v2 --branch` in the session's folder after each turn and every 15 seconds. It's read-only, and repository hooks are switched off for it.
- Everything else comes from Claude Code itself: model, effort, context, usage and cost.
- Nothing leaves your machine. The only thing saved is your palette choice, in Claude Code's own plugin storage.

## Limitations

- **The mode is inferred from the hint line.** Mods have no direct way to read the permission mode, so the strip notices the indicator through the hint text. If the strip ever overlaps or cuts off the mode indicator, press shift+tab once to resync.
- **No single-key shortcut for palettes.** Mods can only attach to Claude Code's existing keybindings, so a key would mean taking one over; switching is a slash command instead.
- **ASCII text only.** Each cell of the strip must hold one single-width character, so non-ASCII characters in folder or branch names show as spaces.
- **Session totals start when the plugin loads.** Token sums and the sparkline count turns since the plugin started in this session. Cost and context come from Claude Code and are always complete.

## How it works

The plugin is three files:

| File | Role |
|---|---|
| `hooks/hooks.json` | Tells Claude Code to load `register.tsx` as a hooks module |
| `hooks/register.tsx` | The whole mod: reads session data, paints the strip, serves `/pixelbar-palette` |
| `types/index.d.ts` | The types of the values the mod keeps in session state |

- **Drawing:** the mod takes over Claude Code's `PromptHint` site (the line under the prompt) and returns a 1-row `Raster`, a grid where every cell's character, foreground and background color is set directly. That's what allows the pixel tiles, gauges and gradients.
- **Data:** the mod gathers its data on these events and keeps it in session state; each change redraws the strip:
  - session start
  - each completed turn (token counts, the sparkline)
  - each model request (effort)
  - each usage update from Claude Code (context, cost, rate limits)
  - a 15-second timer (git)
- **Saved choice:** the palette choice is kept in the plugin's persistent store, so it survives restarts.

## Development

```bash
claude plugin validate plugins/pixelbar   # schema + what the module hooks and calls
claude plugin test plugins/pixelbar       # 5 tests; prints a text preview of the strip
claude --plugin-dir plugins/pixelbar      # a session with your working copy loaded
```

The tests stand in for Claude Code (fake git output, model, usage) and decode the painted cells back into text and colors to check the layout, the mode handling, narrow widths and palette switching.
