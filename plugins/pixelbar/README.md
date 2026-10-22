# pixelbar

A full-width, pixel-art status strip drawn **under** the Claude Code prompt: a pixel character on the left, and two lines of information beside it, divided by a thin rule. The first line is about your project (folder and git). The second is about Claude and the session (mode, model, effort, context, usage, cost, time).

```
  ▄█▄▄█▄    ▐ DIR claude-plugins ▌ ▐ GIT feat/pixelbar *2 ^2 ▌ ▐ DIFF +124 -37 ▌ ▐ COMMIT 5m feat(pixelbar): two lines ▌ ▐ STASH 1 ▌ ░░░░░░░░░░░░░░░░░
 ██▀██▀██   ╶──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╴
 ▄▀ ▀▀ ▀▄   ▐ MODE DEFAULT ▌ ▐ MODEL OPUS 5.5 ▌ ▐ EFFORT ███░░ HIGH ▌ CTX ▆▆▆▆▆▆▆▆░░░░ 42% 84K/200K 5H ▆▆▆░░░ 37% ▐ SESSION 7T $1.23 ▌ ░░ ? for shortcuts
```

In your terminal it is drawn in color, in one of [12 palettes](#palettes) (Game Boy greens by default). Every section can be [switched on or off](#choosing-sections).

## Contents

- [Install](#install)
- [The strip at a glance](#the-strip-at-a-glance)
- [The character](#the-character)
- [Line 1: project](#line-1-project)
- [Line 2: Claude and the session](#line-2-claude-and-the-session)
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

The strip is three terminal rows tall, with the character standing to the left of all three:

| Row | Holds |
|---|---|
| 1 | **Project line:** `DIR`, `GIT`, `DIFF`, `COMMIT`, `STASH` |
| 2 | **Separator:** a thin rule `╶────╴` between the two lines |
| 3 | **Claude line:** `MODE`, `MODEL`, `EFFORT`, `CTX`, `CACHE`, `TOK`, `5H`, `7D`, `SESSION`, `TIME`, `LAST`, `AGENTS`, `TOOLS`, `EDITS`, `CMP`, and the hint |

Most sections are pixel tiles, `▐ LABEL value ▌`, whose half-block edges give them a stepped outline. Gauges (`CTX`, `5H`, `7D`) are bars of `▆` cells. Any space left on a line is filled with a faint dithered trail `░░░`, so the strip always spans the full width.

When a turn that took **a minute or more** finishes, the separator flashes in the accent color for a moment, so a long job's end is easy to notice.

## The character

An 8×6-pixel creature drawn with half-block characters, spanning the full height of the strip. Its mood shows what's going on:

| Mood | Looks like | When |
|---|---|---|
| Idle | Standing still, muted color | Nothing is happening |
| Walking | Accent color, legs stepping | Claude is working on a turn |
| Happy | Arms up, hopping, `*` `+` sparkles | For a moment after a turn finishes |
| Panicking | Alert color, wide eyes, shaking | Context window at 80% or more |
| Asleep | Antennae down, eyes shut, `z` `Z` drifting | No activity for 5 minutes; wakes when you send a prompt |

## Line 1: project

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

How long ago the last commit was made, and its subject: `5m feat(pixelbar): two lines`. Ages read `48s`, `12m`, `1h12m`, `3d`. The subject is cut at 36 characters.

### `STASH`: stashed changes

How many entries `git stash` holds. Hidden when there are none.

All git sections refresh after every turn and every 15 seconds, so branch switches, commits and edits you make outside Claude show up too.

## Line 2: Claude and the session

### `MODE`: permission mode

Shows `MODE DEFAULT` when you're in the default permission mode.

In any other mode (auto, plan, accept edits, bypass permissions), Claude Code draws its own mode indicator, for example `⏵⏵ auto mode on`, to the left of the strip. Mods can't hide it, so the strip moves over to make room and skips its own `MODE` tile. Cycle modes with **shift+tab** as usual.

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

At **80% or more**, the filled gauge and the numbers switch to the palette's alert color, and the character panics. That's a cue to `/compact` or start fresh soon.

### `CACHE`: cache hit rate

The share of input tokens served from the prompt cache this session, for example `92%`. Higher is cheaper and faster.

### `TOK`: tokens per turn

A sparkline (`▁▂▃▄▅▆▇█`) of the tokens each of your last 12 turns used (input, cache and output together), oldest on the left. Bars are scaled to the biggest turn shown, so a tall bar means "an expensive turn compared with the others". Hidden until the first turn completes.

### `5H` and `7D`: usage limits

How much of your five-hour and seven-day rate-limit windows are used, each as a small gauge and a percent. Shown only on a Claude subscription that reports them. They turn to the alert color at 90%.

### `SESSION`: session totals

| Shows | Means |
|---|---|
| `7T` | 7 prompts sent this session |
| `210K` | Tokens used this session, summed over turns (input + output) |
| `$1.23` | The session's cost so far, as `/cost` reports it |

### `TIME`: session clock

How long the session has been running, for example `1h12m`.

### `LAST`: last turn

How long Claude's last turn took, for example `48s`.

### `AGENTS`: subagents

How many subagents are pending, running or waiting, shown in the accent color. Hidden when none are.

### `TOOLS`, `EDITS`, `CMP`: activity counts

| Tile | Counts |
|---|---|
| `TOOLS` | Tool calls made this session |
| `EDITS` | Edit, Write, MultiEdit and NotebookEdit calls this session |
| `CMP` | Times the conversation was compacted |

Each is hidden until its count is above zero.

### Hint (right end)

What's left of Claude Code's own hint line, in a dim shade: `? for shortcuts`, `esc to interrupt` while Claude works, and so on. The `(shift+tab to cycle)` reminder that comes with the mode indicator is left out to save space.

## Choosing sections

Every section can be switched off, and back on, with `/pixelbar-sections`. It works even while Claude is busy, and your choice is remembered for future sessions.

| Command | Does |
|---|---|
| `/pixelbar-sections` | Lists every section with `[x]` (shown) or `[ ]` (hidden) |
| `/pixelbar-sections commit diff` | Toggles each named section |
| `/pixelbar-sections off tools edits` | Hides them, whatever their state |
| `/pixelbar-sections on tools` | Shows them, whatever their state |
| `/pixelbar-sections reset` | Shows everything again |

Section names:
- **Line 1:** `dir`, `git`, `diff`, `commit`, `stash`.
- **Line 2:** `mode`, `model`, `effort`, `ctx`, `cache`, `tok`, `5h`, `7d`, `session`, `time`, `last`, `agents`, `tools`, `edits`, `compacts`, `hint`.

## Narrow terminals

Each line stays on its own row. When a line doesn't fit, its least important sections drop out first:

- **Line 1:** `STASH`, then `COMMIT`, then `DIFF`. `DIR` and `GIT` stay.
- **Line 2**, in this order:
  1. `7D`, `TOOLS`, `CMP`
  2. `TOK`, `5H`, `CACHE`, `LAST`, `EDITS`
  3. `SESSION`, `TIME`, `AGENTS`
  4. The hint
  5. `MODEL`, `EFFORT`

  `MODE` and `CTX` stay.

The strip always stops one column short of the terminal's right edge, because writing into the last column can make some terminals wrap and leave an empty line.

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

- **The mode is inferred from the hint line.** Mods have no direct way to read the permission mode, so the strip notices the mode indicator through the hint text. If the strip ever overlaps or cuts off the indicator, press shift+tab once to resync.
- **No single-key shortcuts.** Mods can only attach to Claude Code's existing keybindings, so a key would mean taking one over. Palettes and sections are switched with slash commands instead.
- **ASCII text only.** Each cell of the strip must hold one single-width character, so non-ASCII characters in folder names, branch names or commit subjects show as spaces.
- **Some counts start when the plugin loads.** Token sums, the sparkline, `CACHE`, `TOOLS`, `EDITS`, `CMP` and `LAST` count from when the plugin started in this session. Cost, context, `TIME` and the usage limits come from Claude Code and are always complete.

## How it works

The plugin is three files:

| File | Role |
|---|---|
| `hooks/hooks.json` | Tells Claude Code to load `register.tsx` as a hooks module |
| `hooks/register.tsx` | The whole mod: reads session data, animates the character, paints the strip, serves `/pixelbar-palette` and `/pixelbar-sections` |
| `types/index.d.ts` | The types of the values the mod keeps in session state |

- **Drawing:** the mod takes over Claude Code's `PromptHint` site (the line under the prompt) and returns a 3-row `Raster`, a grid where every cell's character, foreground and background color is set directly. That's what allows the character, pixel tiles, gauges and gradients.
- **Data:** the mod gathers its data on these events and keeps it in session state; each change redraws the strip:
  - session start
  - each completed turn (token counts, the sparkline, the last turn's length)
  - each model request (effort)
  - each tool call and compaction (activity counts)
  - each usage update from Claude Code (context, cost, rate limits)
  - a 15-second timer (git, subagents)
- **Animation:** a timer redraws about three times a second only while there is something to animate (a turn running, the happy moment, the flash), and slowly while the character sleeps. Otherwise the strip stays still and costs nothing.
- **Saved choices:** the palette and the hidden sections are kept in the plugin's persistent store, so they survive restarts.

## Development

```bash
claude plugin validate plugins/pixelbar   # schema + what the module hooks and calls
claude plugin test plugins/pixelbar       # 8 tests; prints a text preview of the strip
claude --plugin-dir plugins/pixelbar      # a session with your working copy loaded
```

The tests stand in for Claude Code (fake git output, model, usage, a mock clock) and decode the painted cells back into text and colors. They check the layout, the mode handling, narrow widths, the character's panic and sleep moods, and both commands.
