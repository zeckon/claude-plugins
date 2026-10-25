# pixelbar

A single-row, full-width, pixel-art status strip drawn **under** the Claude Code prompt, in place of Claude Code's own hint line and mode indicator. A little pixel walker on the left, then Claude and the session (mode, model, effort, context, usage, cost, session clock), and your project (folder and git) at the right end.

**Video:** [watch the 3:00 explainer](https://zeckon.github.io/claude-plugins/pixelbar/)

```
 ▛▜  ▐ MODE AUTO ▌ ▐ MODEL OPUS 5.5 ▌ ▐ ▁▂▃▄▅ ▌ CTX ▆▆▆▆░░ 42% 84K/200K 5H ▆▆░░░░ 37% ▐ SESSION 1h12m 7T $1.23 ▌ ░░░░░░░░ ▐ DIR claude-plugins ▌ ▐ GIT feat/pixelbar *2 ^2 ▌ ▐ DIFF +124 -37 ▌
```

In your terminal it is drawn in color, in one of [12 palettes](#palettes) (Game Boy greens by default). Every section can be [switched on or off](#choosing-sections).

## Contents

- [Install](#install)
- [The strip at a glance](#the-strip-at-a-glance)
- [The walker](#the-walker)
- [Project sections](#project-sections)
- [Claude and session sections](#claude-and-session-sections)
- [Choosing sections](#choosing-sections)
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

**3. Check it works:** the dim `? for shortcuts` line under the prompt is replaced by the strip, and `/pixelbar-palette` and `/pixelbar-sections` show up when you type `/pix`.

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

## The strip at a glance

Everything sits on one row. From the left:

| Part | Holds |
|---|---|
| Walker | A 2-cell pixel character whose mood shows what's going on |
| Claude and session sections | `MODE`, `MODEL`, `EFFORT`, `CTX`, `CACHE`, `TOK`, `5H`, `SESSION`; `7D`, `LAST`, `AGENTS`, `TOOLS`, `EDITS`, `CMP` hidden by default |

Then, packed against the right end:

| Part | Holds |
|---|---|
| Hint | Claude Code's own hint text; hidden by default |
| Project sections | `DIR`, `GIT`, `DIFF`, `STASH`; `COMMIT` hidden by default |

Most sections are pixel tiles, `▐ LABEL value ▌`, whose half-block edges give them a stepped outline. Gauges (`CTX`, `5H`, `7D`) are bars of `▆` cells. The space between the two groups is filled with a faint dithered trail `░░░`, so the strip always spans the full width.

## The walker

A tiny creature built from quarter-block characters, two cells wide, with a third cell beside it for sparkles and z's. Its mood shows what's going on:

| Mood | Looks like | When |
|---|---|---|
| Idle | `▛▜` standing still, muted color | Nothing is happening |
| Walking | `▛▜` / `▜▛` stepping, accent color | Claude is working on a turn |
| Happy | `▟▙` / `▛▜` hopping with `*` `+` sparkles | For a moment after a turn finishes |
| Panicking | Shaking, alert color | Context window at 80% or more |
| Asleep | `▄▄` curled up, `z` `Z` drifting | No activity for 5 minutes; wakes when you send a prompt |

## Project sections

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

### `DIFF`: lines changed

Lines added and removed in the working tree against the last commit, for example `+124 -37`. Hidden when there are no changes.

### `COMMIT`: last commit

**Hidden by default**; switch it on with `/pixelbar-sections on commit`. How long ago the last commit was made, and its subject: `5m feat(pixelbar): two lines`. Ages read `48s`, `12m`, `1h12m`, `3d`. The subject is cut at 36 characters.

### `STASH`: stashed changes

How many entries `git stash` holds. Hidden when there are none.

All git sections refresh after every turn and every 15 seconds, so branch switches, commits and edits you make outside Claude show up too.

## Claude and session sections

### `MODE`: permission mode

The permission mode you're in: `MODE DEFAULT`, `MODE ACCEPT EDITS`, `MODE PLAN`, `MODE AUTO`, `MODE BYPASS` or `MODE DON'T ASK`. Cycle modes with **shift+tab** as usual; the tile follows.

Claude Code draws its own mode indicator (`⏵⏵ auto mode on`) at the start of the line under the prompt. The strip paints over it, so the line's whole width is the strip's, and this tile takes its place. `MODE ON` means some mode other than the default is on but the strip doesn't know which yet (see [Limitations](#limitations)).

### `MODEL`: the main model

The model the conversation runs on, as `/model` names it, shortened: `claude-opus-5-5` shows as `OPUS 5.5`, and a 1M-context variant gets ` 1M` added.

### `EFFORT`: reasoning effort

How hard the model is set to think, as a tile of five rising bars, `▐ ▁▂▃▄▅ ▌`, lit (in the values color) up to the current level:

| Bars lit | Level |
|---|---|
| 1 | low |
| 2 | medium |
| 3 | high |
| 4 | xhigh |
| 5 | max |

`EFFORT AUTO` means it's not known yet, or the model has no effort setting.

The exact value is read from each request Claude sends. Before the first one in a session, it falls back to the `effortLevel` setting, then the `CLAUDE_EFFORT` environment variable.

### `CTX`: context window

How full the conversation's context window is:

- **Gauge:** six cells, filling left to right, shading from dim to the accent color as it grows.
- **Percent:** for example `42%`.
- **Tokens:** used / window size, for example `84K/200K`.

At **80% or more**, the filled gauge and the numbers switch to the palette's alert color, and the walker panics. That's a cue to `/compact` or start fresh soon.

### `CACHE`: cache hit rate

The share of input tokens served from the prompt cache this session, for example `92%`. Higher is cheaper and faster.

### `TOK`: tokens per turn

A sparkline (`▁▂▃▄▅▆▇█`) of the tokens each of your last 12 turns used (input, cache and output together), oldest on the left. Bars are scaled to the biggest turn shown, so a tall bar means "an expensive turn compared with the others". Hidden until the first turn completes.

### `5H` and `7D`: usage limits

`7D` is **hidden by default**; switch it on with `/pixelbar-sections on 7d`. How much of your five-hour and seven-day rate-limit windows are used, each as a small gauge and a percent. Shown only on a Claude subscription that reports them. They turn to the alert color at 90%.

### `SESSION`: session totals

| Shows | Means |
|---|---|
| `1h12m` | How long the session has been running |
| `7T` | 7 prompts sent this session |
| `210K` | Tokens used this session, summed over turns (input + output) |
| `$1.23` | The session's cost so far, as `/cost` reports it |

### `LAST`: last turn

**Hidden by default** (`/pixelbar-sections on last`). How long Claude's last turn took, for example `48s`.

### `AGENTS`: subagents

**Hidden by default** (`/pixelbar-sections on agents`). How many subagents are pending, running or waiting, shown in the accent color. Hidden when none are.

### `TOOLS`, `EDITS`, `CMP`: activity counts

| Tile | Counts |
|---|---|
| `TOOLS` | Tool calls made this session |
| `EDITS` | Edit, Write, MultiEdit and NotebookEdit calls this session |
| `CMP` | Times the conversation was compacted |

All three are **hidden by default** (`/pixelbar-sections on tools edits compacts`). Once switched on, each still stays out of sight until its count is above zero.

### Hint

**Hidden by default** (`/pixelbar-sections on hint`). Sits just before the project sections. What's left of Claude Code's own hint line, in a dim shade: `? for shortcuts`, `esc to interrupt` while Claude works, and so on. The `(shift+tab to cycle)` reminder that comes with the mode indicator is left out to save space.

## Choosing sections

Every section can be switched off, and back on, with `/pixelbar-sections`. It works even while Claude is busy, and your choice is remembered for future sessions. By default these are hidden: `commit`, `7d`, `last`, `agents`, `tools`, `edits`, `compacts` and `hint`. Everything else is shown.

| Command | Does |
|---|---|
| `/pixelbar-sections` | Lists every section with `[x]` (shown) or `[ ]` (hidden) |
| `/pixelbar-sections commit diff` | Toggles each named section |
| `/pixelbar-sections off tools edits` | Hides them, whatever their state |
| `/pixelbar-sections on commit` | Shows them, whatever their state |
| `/pixelbar-sections all` | Shows every section |
| `/pixelbar-sections reset` | Back to the defaults |

Section names:
- **Project:** `dir`, `git`, `diff`, `commit`, `stash`.
- **Claude and session:** `mode`, `model`, `effort`, `ctx`, `cache`, `tok`, `5h`, `7d`, `session`, `last`, `agents`, `tools`, `edits`, `compacts`, `hint`.

## Narrow terminals

When the row doesn't fit, the least important sections drop out first (among equals, the rightmost), in this order:

1. `STASH`, `7D`, `TOOLS`, `CMP`
2. `COMMIT` (if shown), `TOK`, `5H`, `CACHE`, `LAST`, `EDITS`
3. `DIFF`, `SESSION`, `AGENTS`
4. The hint
5. `MODEL`, `EFFORT`
6. `GIT`

The walker, `DIR`, `MODE` and `CTX` stay.

The strip spans the line from Claude Code's left margin to its right one, so it never writes into the terminal's last column (which can make some terminals wrap and leave an empty line).

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

- After each turn and every 15 seconds, the strip runs four read-only git commands in the session's folder, with repository hooks switched off:
  - `git status --porcelain=v2 --branch`
  - `git diff --shortstat HEAD`
  - `git log -1`
  - `git rev-list --count refs/stash`
- Everything else comes from Claude Code itself: model, effort, context, usage, cost, subagents, tool calls.
- Nothing leaves your machine. The only things saved are your palette and hidden sections, in Claude Code's own plugin storage.

## Limitations

- **The mode is inferred.** Mods have no direct way to read the permission mode. The strip starts from the `defaultMode` in your settings, follows each shift+tab through the hint text, and is corrected by every prompt you send. If you launch with a `--permission-mode` that differs from your settings, the `MODE` tile can be wrong, and the strip a few columns off, until the first shift+tab or prompt.
- **Measured against Claude Code 2.1.308.** To cover Claude Code's mode indicator, the strip relies on that indicator's width in each mode and on the order shift+tab steps through the modes. A Claude Code release that changes either can leave the strip misaligned.
- **No single-key shortcuts.** Mods can only attach to Claude Code's existing keybindings, so a key would mean taking one over. Palettes and sections are switched with slash commands instead.
- **ASCII text only.** Each cell of the strip must hold one single-width character, so non-ASCII characters in folder names, branch names or commit subjects show as spaces.
- **Some counts start when the plugin loads.** Token sums, the sparkline, `CACHE`, `TOOLS`, `EDITS`, `CMP` and `LAST` count from when the plugin started in this session. Cost, context, the session clock and the usage limits come from Claude Code and are always complete.

## How it works

The plugin is three files:

| File | Role |
|---|---|
| `hooks/hooks.json` | Tells Claude Code to load `register.tsx` as a hooks module |
| `hooks/register.tsx` | The whole mod: reads session data, animates the walker, paints the strip, serves `/pixelbar-palette` and `/pixelbar-sections` |
| `types/index.d.ts` | The types of the values the mod keeps in session state |

- **Drawing:** the mod takes over Claude Code's `PromptHint` site (the line under the prompt) and returns a 1-row `Raster`, a grid where every cell's character, foreground and background color is set directly. That's what allows the walker, pixel tiles, gauges and gradients. Claude Code seats the site to the right of its mode indicator, so the site keeps one cell and the `Raster` is drawn absolutely positioned from it, reaching back over the indicator to the line's left margin.
- **Data:** the mod gathers its data on these events and keeps it in session state; each change redraws the strip:
  - session start
  - each completed turn (token counts, the sparkline, the last turn's length)
  - each model request (effort)
  - each prompt and each hint change (permission mode)
  - each tool call and compaction (activity counts)
  - each usage update from Claude Code (context, cost, rate limits)
  - a 15-second timer (git, subagents)
- **Animation:** a timer redraws about three times a second only while there is something to animate (a turn running, the happy moment), and slowly while the walker sleeps. Otherwise the strip stays still and costs nothing.
- **Saved choices:** the palette and the hidden sections are kept in the plugin's persistent store, so they survive restarts.

## Development

```bash
claude plugin validate plugins/pixelbar   # schema + what the module hooks and calls
claude plugin test plugins/pixelbar       # 9 tests; prints a text preview of the strip
claude --plugin-dir plugins/pixelbar      # a session with your working copy loaded
```

The tests stand in for Claude Code (fake git output, model, usage, a mock clock) and decode the painted cells back into text and colors. They check the layout, the mode handling, narrow widths, the walker's panic and sleep moods, and both commands.
