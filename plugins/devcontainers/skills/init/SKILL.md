---
description: Scaffold .devcontainer/devcontainer.json for the current project. Detects the language, package manager, and lockfiles, then writes a working config with image, features, and postCreateCommand. With --interactive, asks for confirmation before writing.
when_to_use: Use when the user says "init devcontainer", "create devcontainer.json", "set up a dev container for this project", or asks for a containerized dev environment for the current repo.
argument-hint: "[--interactive]"
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Initialize a devcontainer for this project

## Refuse if a config already exists

Check whether `.devcontainer/devcontainer.json`, `.devcontainer.json`, or `.devcontainer/<name>/devcontainer.json` already exists. If any does, refuse with one short sentence and suggest `/devcontainers:add-feature <name>` for additions, or direct edit for invasive changes. Do not overwrite.

## Detect the project

Use Glob/Read on the workspace root. Map signals to languages and package managers:

| Signal | Implies |
|---|---|
| `package.json` + `bun.lockb` (or `bun.lock`) | Bun |
| `package.json` + `pnpm-lock.yaml` | pnpm |
| `package.json` + `yarn.lock` | Yarn |
| `package.json` + `package-lock.json` | npm |
| `package.json` (no lockfile) | npm |
| `pyproject.toml` + `poetry.lock` | Poetry |
| `pyproject.toml` + `uv.lock` | uv |
| `pyproject.toml` (no lockfile) | pip / pyproject |
| `requirements.txt` | pip |
| `Pipfile` | pipenv |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `Gemfile` | Ruby/Bundler |
| `composer.json` | PHP |
| `pom.xml` | Java/Maven |
| `build.gradle` / `build.gradle.kts` | Java/Gradle |
| `mix.exs` | Elixir |

If multiple language signals are present, pick the dominant one (most files, or the one with a lockfile). If unclear, default to the universal image and note the ambiguity.

## Pick the base image

Pin to a major tag — never `latest`.

| Project type | Image |
|---|---|
| Node-only | `mcr.microsoft.com/devcontainers/javascript-node:1-22` |
| Python-only | `mcr.microsoft.com/devcontainers/python:1-3.12` |
| Go-only | `mcr.microsoft.com/devcontainers/go:1-1.23` |
| Rust-only | `mcr.microsoft.com/devcontainers/rust:1` |
| Java-only | `mcr.microsoft.com/devcontainers/java:1-21` |
| PHP-only | `mcr.microsoft.com/devcontainers/php:1` |
| Ruby-only | `mcr.microsoft.com/devcontainers/ruby:1-3.3` |
| Mixed / unclear / nothing detected | `mcr.microsoft.com/devcontainers/universal:2` |

## Pick features

Always include:

- `ghcr.io/devcontainers/features/common-utils:2`
- `ghcr.io/devcontainers/features/git:1`

Add language-specific features only when the base image doesn't already cover the language (e.g. add `node:1` if the project uses Node and the base is `python` or `universal`):

- `ghcr.io/devcontainers/features/node:1`
- `ghcr.io/devcontainers/features/python:1`
- `ghcr.io/devcontainers/features/go:1`
- `ghcr.io/devcontainers/features/rust:1`

If the project uses Docker (has a `Dockerfile`/`compose.yaml` for itself, separate from the dev one we're writing), add `ghcr.io/devcontainers/features/docker-in-docker:2`.

## Wire postCreateCommand

Map detected package managers to install commands:

| Manager | Command |
|---|---|
| Bun | `bun install` |
| pnpm | `pnpm install --frozen-lockfile` |
| Yarn | `yarn install --frozen-lockfile` |
| npm + lockfile | `npm ci` |
| npm only | `npm install` |
| Poetry | `poetry install` |
| uv | `uv sync` |
| pip + requirements | `pip install -r requirements.txt` |
| pipenv | `pipenv install --dev` |
| Go | `go mod download` |
| Cargo | `cargo fetch` |
| Bundler | `bundle install` |

If multiple are detected (monorepo): chain with `&&`. If nothing applicable: omit `postCreateCommand` entirely.

## Write the file

Path: `.devcontainer/devcontainer.json`. Format with 2-space indent. Key order: `name`, `image`, `features`, `forwardPorts`, `postCreateCommand`, `remoteUser`. Always include:

- `name`: `<project-basename>-dev`
- `remoteUser`: `vscode` (the standard user in MS images)

Skip `forwardPorts` unless the project's framework has obvious ports (Next.js → 3000, Django → 8000, Rails → 3000, Vite → 5173). Keep it minimal, not exhaustive.

No comments in the JSON.

## --interactive mode

If `$0` is `--interactive`:

1. Print the proposed config (image, features, postCreate) before writing.
2. Ask one combined question: "Write this config? (y / describe a change / cancel)"
3. If yes, write. If a change is described, adjust and re-ask. If cancel, stop.

## After writing

Print a short summary:

- File path written
- Image and key features (one line)
- Suggest `/devcontainers:up` to bring up the container
