---
description: Append a feature to the existing .devcontainer/devcontainer.json. Accepts shorthand names (node, python, docker-in-docker, github-cli, common-utils, aws-cli, gcp-cli, terraform, kubectl-helm-minikube, go, rust, java) or fully-qualified OCI refs. Idempotent — refuses to add a feature that's already present.
when_to_use: Use when the user says "add the X feature to my devcontainer", "include node in the dev container", or specifies a devcontainer feature by name.
argument-hint: "<feature>[@version]"
allowed-tools: Read, Edit, Bash
---

# Add a devcontainer feature: `$0`

## Resolve the feature ref

The argument is `$0`. Map shorthand to fully-qualified refs:

| Shorthand | Full ref |
|---|---|
| `common-utils` | `ghcr.io/devcontainers/features/common-utils:2` |
| `git` | `ghcr.io/devcontainers/features/git:1` |
| `node` | `ghcr.io/devcontainers/features/node:1` |
| `python` | `ghcr.io/devcontainers/features/python:1` |
| `go` | `ghcr.io/devcontainers/features/go:1` |
| `rust` | `ghcr.io/devcontainers/features/rust:1` |
| `java` | `ghcr.io/devcontainers/features/java:1` |
| `ruby` | `ghcr.io/devcontainers/features/ruby:1` |
| `dotnet` | `ghcr.io/devcontainers/features/dotnet:2` |
| `docker-in-docker` | `ghcr.io/devcontainers/features/docker-in-docker:2` |
| `docker-outside-of-docker` | `ghcr.io/devcontainers/features/docker-outside-of-docker:1` |
| `github-cli` | `ghcr.io/devcontainers/features/github-cli:1` |
| `aws-cli` | `ghcr.io/devcontainers/features/aws-cli:1` |
| `gcp-cli` | `ghcr.io/devcontainers/features/gcp-cli:1` |
| `terraform` | `ghcr.io/devcontainers/features/terraform:1` |
| `kubectl-helm-minikube` | `ghcr.io/devcontainers/features/kubectl-helm-minikube:1` |
| `conda` | `ghcr.io/devcontainers/features/conda:1` |
| `powershell` | `ghcr.io/devcontainers/features/powershell:1` |

Argument forms:

- Shorthand only (e.g. `node`) → use the table.
- Shorthand with `@VERSION` (e.g. `node@22`) → use the shorthand's ref but override the tag with `:VERSION` (so `node@22` → `ghcr.io/devcontainers/features/node:22`). Note: for many features the tag tracks the feature's own version, not the language version — language version is set via the feature's *options*, not its tag. If the user passes `@VERSION` and the table shows the feature uses tag `:1`, ask whether they meant the language version (and want to set the option) or the feature publication tag.
- Contains `/` or `:` → treat as a fully-qualified OCI ref and use as-is.

If `$0` is unrecognized and not fully-qualified, refuse with one line listing the shorthands above.

## Add to the active config

1. Locate the active config:
   - `.devcontainer/devcontainer.json`
   - `.devcontainer.json`
   - `.devcontainer/<name>/devcontainer.json`

2. If no config exists, refuse and suggest `/devcontainers:init`.

3. Read the file. If the resolved ref is already a key in `features`, refuse with one line ("already present"). Idempotent.

4. Edit the file to add the feature. If `features` doesn't exist, create it. New value: `{}` (empty options object). Place the new key at the end of the existing `features` object so the diff is minimal.

5. Print a short summary: file path, feature added, and a one-line suggestion to run `/devcontainers:rebuild` so the change takes effect.

## JSONC handling

devcontainer.json supports comments and trailing commas. Preserve any existing comments and formatting. Use Edit (string replacement) rather than rewriting the entire file when possible.
