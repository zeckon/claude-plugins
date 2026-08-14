# explain

Claude Code plugin that turns a code change into a lesson. `/explain:diff` investigates a diff, branch, or pull request — including the surrounding code it touches — and generates a rich, self-contained interactive HTML document that teaches the change: background, the problem it solves, the core intuition, data-flow diagrams, a before/after comparison, a code walkthrough, edge cases and trade-offs, testing, and a five-question comprehension quiz.

The goal is understanding, not summarization: someone who didn't author the change should come away able to explain it in their own words.

## Install

Register the marketplace (once per Claude Code instance — skip if you've already added it for another plugin):

```text
/plugin marketplace add zeckon/claude-plugins
```

Install this plugin:

```text
/plugin install explain@zeckon-claude-plugins
```

## Usage

```text
/explain:diff <what to explain>
```

The argument can be anything Claude can resolve to a change in the current repository:

- the current uncommitted / staged changes
- a branch (`feature/x` vs `main`)
- a commit or commit range
- a pull request number or URL

Examples:

```text
/explain:diff the current branch against main
```

```text
/explain:diff PR #123
```

```text
/explain:diff commit abc1234
```

## Output

One self-contained HTML file — embedded CSS and JavaScript, no external resources — saved **outside the repository** so it never pollutes your project or git history:

```text
/tmp/YYYY-MM-DD-explanation-<slug>.html
```

Open it directly in a browser. The document is a single long page with a table of contents, HTML/CSS diagrams (never ASCII art), callouts, code excerpts, and an interactive scored quiz.

## What it does before writing

The skill does not explain the diff in isolation. It first reads the modified files, their callers and dependencies, relevant tests, and git history where that clarifies intent — and it distinguishes what the code demonstrates from what is inferred or uncertain, rather than inventing motivations.

## Permissions

The skill reads the repository and runs read-only `git` commands (diff, log, show), so Claude Code may prompt for Bash permission on first use. It writes only the output HTML file under `/tmp`; it never modifies project source files.

## Uninstall

```text
/plugin uninstall explain@zeckon-claude-plugins
```
