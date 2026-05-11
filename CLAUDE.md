# claude-plugins — Claude Development Guide

## Meta rule

When you learn something about this project's process — a workflow step, a gotcha, a non-obvious command sequence — add it to this file immediately. Do not rely on remembering it in a future conversation. This file is the source of truth for how to work on this project.

---

## Operating principles

1. **Surface assumptions before building.** Wrong assumptions held silently are the most common failure mode. State them in the issue or PR; let me redirect before code lands.
2. **Stop and ask when requirements conflict.** Don't guess. If the spec and the existing code disagree, surface options A/B/C — don't silently pick.
3. **Push back when warranted.** Quantify the pushback rather than soft-pedaling it.
4. **Prefer the boring, obvious solution.** Three similar lines is better than a premature abstraction. Don't design for hypothetical future requirements. No half-finished implementations.
5. **Touch only what you're asked to touch.** Don't clean up adjacent code, refactor unrelated imports, or remove comments you don't understand. Scope discipline.

## Verification

Every task closes with **evidence**, not vibes. Acceptable evidence:

- `claude plugin validate .` passes (marketplace manifest + every plugin's `plugin.json`, skill frontmatter, `hooks/hooks.json`)
- For skill / hook changes: install the plugin locally and exercise the affected slash command or hook end-to-end
- For docs / README changes: render and re-read

"Seems right" never closes the loop.

## Recurring rationalizations

- *"This is too small for an issue."* Every change goes through the issue → branch → PR flow, including chores and docs. The friction is a feature.
- *"Just one more refactor in this PR."* Scope creep. File a follow-up; ship the PR you opened.
- *"It works locally."* Doesn't count. Validate must pass and the plugin must install cleanly from the marketplace.

---

## Development Flow

Every piece of work follows this flow, no exceptions — including small chores, docs PRs, and config tweaks. If you find yourself reaching for `git push origin main` directly, stop and file an issue first.

### 1. Issue first

```bash
gh issue create --repo zeckon/claude-plugins \
  --title "<area>: <what and why>" \
  --label "<label>" \
  --body "..."
```

`<area>` is usually a plugin name (`history`) or `marketplace` / `docs` / `repo`.

### 2. Branch from main

Branch name: `<type>/<issue-number>-<short-slug>`

```bash
git checkout main && git pull
git checkout -b fix/12-history-log-empty-repo
```

| Branch prefix | When |
|---|---|
| `fix/` | Bug fix |
| `feat/` | New plugin, new skill, new hook |
| `perf/` | Performance improvement |
| `chore/` | Cleanup, tech debt, deps |
| `docs/` | README / CLAUDE.md / plugin docs |

### 2b. Mark the issue in flight

Before writing code, make the work visible on the issue and the project board. Skipping this step means the board lies — work that's already underway looks untouched until the PR opens.

```bash
# Self-assign:
gh issue edit <N> --add-assignee @me
```

Project-board automation (assignee, status transitions, IDs) is not wired up
in this checkout — fill in `--project-id` / `--field-id` / `--single-select-option-id`
locally if/when a board is configured.

### 3. Do the work

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) — short, imperative, no trailing period.

| Prefix | Use for |
|---|---|
| `feat:` | New plugin, new skill, new hook, new capability |
| `fix:` | Bug fix |
| `perf:` | Performance improvement |
| `chore:` / `docs:` / `refactor:` / `style:` / `ci:` | Non-functional changes |
| `feat!:` / `fix!:` / `BREAKING CHANGE:` footer | Breaking change to a plugin's public surface (skill name, hook contract, plugin name) |

Squash-merging a PR uses the PR title as the commit subject — keep PR titles in this same format.

Scope optional but encouraged when touching one plugin: `feat(history): ...`, `fix(history): ...`.

### 4. Open a PR

```bash
gh pr create --title "<same as issue title>" --body "$(cat <<'EOF'
Closes #<issue-number>

## What
<brief description>

## Why
<motivation>

## Test plan
- [ ] `claude plugin validate .`
- [ ] Install locally and exercise affected skill / hook
EOF
)"
```

`Closes #N` auto-closes the issue on merge.

### 4a. Keeping issue + PR in sync

- Scope change → edit the issue body.
- Decision made during implementation → edit the PR body.
- Discussion / status / "we tried X and it didn't work" → comment on the issue.
- Non-obvious finding (Claude Code harness behavior, manifest schema gotcha, hook event quirk) → "findings" section in the PR body, *and* in the relevant code comment if load-bearing.

---

## Labels

| Label | Use for |
|---|---|
| `bug` | Incorrect behavior |
| `enhancement` | New plugin, skill, or capability |
| `performance` | Slow hooks, slow skills |
| `technical-debt` | Cleanup, dead code, inconsistencies |
| `documentation` | README / CLAUDE.md / plugin docs |

---

## Project at a glance

Personal Claude Code plugin marketplace hosted at `github.com/zeckon/claude-plugins`. Marketplace manifest at `.claude-plugin/marketplace.json`; one directory per plugin under `plugins/<name>/`. Each plugin's slash commands are namespaced `/<plugin>:<skill>`. See [`README.md`](README.md) for repo layout and adding a new plugin.

## Active conventions

### Plugin manifests

Every plugin needs `plugins/<name>/.claude-plugin/plugin.json` with `name`, `description`, `version`, `author`. New plugins must also be added to the `plugins` array in `.claude-plugin/marketplace.json` with `name` and `source: "./plugins/<name>"`.

### Skill frontmatter

Skills live at `plugins/<plugin>/skills/<skill>/SKILL.md`. Frontmatter must include `description` (the trigger sentence Claude reads to decide when to invoke). If the skill's `!` injection block contains shell logic (variables, `$()`, conditionals), include `allowed-tools: Bash` — the harness static-analyzes the block and refuses non-literal commands without it.

### Hooks

Hooks live at `plugins/<plugin>/hooks/hooks.json`. Hook scripts in `plugins/<plugin>/scripts/`. User-facing wrappers (if any) in `plugins/<plugin>/bin/`. Hooks and shell-injection skills prompt for Bash permission on first use; document per-plugin permission needs in the plugin's README.

### Validation

```bash
claude plugin validate .
```

Run before opening a PR. Validates the marketplace manifest and every plugin's `plugin.json`, skill frontmatter, and `hooks/hooks.json` for syntax and schema errors.

---

## Testing plugin changes locally before merging

`claude plugin validate` only catches schema errors. To verify slash commands and hooks actually behave correctly, install the plugin from your branch's working tree, exercise it, then revert to the published version. The full loop, run inside Claude Code:

```text
# Replace the published install with the local checkout:
/plugin uninstall <plugin>@zeckon-claude-plugins
/plugin marketplace remove zeckon-claude-plugins
/plugin marketplace add <absolute-path-to-this-checkout>
/plugin install <plugin>@zeckon-claude-plugins
/reload-plugins

# Exercise the change end-to-end. Slash commands AND hooks now run from the
# branch's code. Make further edits, then /reload-plugins to pick them up.

# Revert when done — back to the published version:
/plugin uninstall <plugin>@zeckon-claude-plugins
/plugin marketplace remove zeckon-claude-plugins
/plugin marketplace add zeckon/claude-plugins
/plugin install <plugin>@zeckon-claude-plugins
/reload-plugins
```

`<absolute-path-to-this-checkout>` is the absolute path to the marketplace root (the directory containing `.claude-plugin/marketplace.json`), e.g. the directory you cloned this repo into.

Faster paths when you don't need the full integration:

- **Pure bash logic, no slash-command/hook integration involved:** invoke the wrapper directly from the working tree, e.g. `bash plugins/<plugin>/bin/<wrapper> <subcmd> ...`. No install dance.
- **Tests:** `bash plugins/<plugin>/tests/run-tests.sh`. Each test runs in an isolated `$HOME` so it can't see real on-disk state.

For changes that mutate persistent state (e.g. shadow-history captures, files outside the workspace), test from a sandbox `$PWD` like `mkdir /tmp/<plugin>-test && cd $_` so your real workspace state isn't polluted.

---

## Reference

- [Anthropic's marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces) — hosting, versioning, manifest schema
- [`README.md`](README.md) — repo layout, install instructions, add-a-plugin checklist
- Per-plugin READMEs under `plugins/<name>/README.md` — usage and permissions for each plugin
