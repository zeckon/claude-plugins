# Multi-service compose support

For `dockerComposeFile` configs that declare more than one service, the `service` field in `devcontainer.json` selects the **primary** — the one Claude attaches to. The lifecycle wrappers (`build`, `up`, `exec`, `rebuild`) accept `--service <name>` to target any other service.

## How routing works

- `--service` omitted, or matches the primary → routed through the `devcontainer` CLI (`devcontainer exec`, `devcontainer up`, etc.).
- `--service` names a non-primary service → routed through `docker compose` (`docker compose -p <project> -f <files> exec <name> …`), since the `devcontainer` CLI itself only targets the primary.

Compose-file paths come from `devcontainer read-configuration`'s merged output, resolved relative to the directory containing the active `devcontainer.json`. Multi-file `dockerComposeFile` arrays are handled.

## Run `up` first

The `--service` path needs the docker-compose project name that the `devcontainer` CLI used when it brought the stack up. We discover it from a label on the running primary container (`devcontainer.local_folder=$PWD` → its `com.docker.compose.project`).

**If no devcontainer is running for the current workspace, the wrappers refuse with `no running devcontainer found — run /devcontainers:up first`.** Bring the primary up before targeting siblings; otherwise compose would invent its own project name and the sibling commands would land in a different namespace than the CLI created.

## Caveats

- **Non-primary services bypass `devcontainer` features.** `postCreateCommand`, `remoteUser`, lifecycle hooks etc. only run on the primary. If you need the same lifecycle for a sibling, declare it inside the compose file directly.
- **Argument quoting.** Skill `!` blocks substitute the slash-command argument list into a bash command line via word-splitting. Args containing spaces or shell metacharacters (`;`, `|`, `&&`, `"`) won't survive intact. Stick to simple, unquoted args: `/devcontainers:exec --service db -- psql -U postgres`. For complex commands, use `Bash` directly or place a script on disk and exec it.
- **`exec` flag intercept.** The wrapper parses `--service` and `--no-cache` no matter where they appear in argv, so `exec ls --service` would be misread as `--service` with no value. When the inner command has its own flags, separate them with `--`: `/devcontainers:exec -- ls --color`.
