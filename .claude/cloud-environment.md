# The cloud environment

The routines run in an Anthropic-hosted cloud session, not a worktree on a
developer machine. This file records what that image gives us, what it does
not, and the setup script that closes the gap.

## What the image already has

Docker (`docker`, `dockerd`, `docker compose`), PostgreSQL 16, Redis 7, Go,
Node 20–22, bun, `git`, `gh`, `jq`, `ripgrep`. Four vCPUs, 16 GB of memory,
30 GB of disk. Docker Hub is on the default **Trusted** network allowlist, so
`postgres:16.4-alpine` pulls without any change to the environment.

Docker and Postgres are installed but **not running**. Nothing starts them for
you, which is why `scripts/cloud_session_start.sh` runs as a SessionStart hook:
the environment's snapshot keeps installed files and no running process, so
each session has to start the daemon itself.

## What it does not have

`mise`, which every rule in this repository is written in terms of. The setup
script below installs it. Without it a session falls back to bare `go test`
and `go run …@version`, which works but pins nothing.

## The setup script

Paste this into **Setup script** in the environment dialog at
[claude.ai/code](https://claude.ai/code). The copy here is the source of truth
for review, not the copy that runs: the snapshot skips the setup step on every
session after the first, so **editing this file changes nothing until the text
is pasted again**.

```bash
#!/bin/bash
# GetStronger cloud environment. Every step may fail without failing the
# session: a non-zero exit here means no session starts at all.
set -u
export MISE_YES=1
repo=/home/user/getstronger

# The npm registry is on the Trusted allowlist; mise.run is not, so the
# installer is the fallback rather than the first choice.
npm install -g mise || curl -fsSL https://mise.run | sh || true
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"

mise trust "$repo/mise.toml" || true

# The image pulls this for every backend suite, and the snapshot keeps it.
docker pull postgres:16.4-alpine &

# Go arrives through proxy.golang.org, which is allowlisted. The tools built
# from GitHub releases may not: see "If the toolchain comes up short" below.
(cd "$repo" && mise install) &

wait
mise --version || true
exit 0
```

Two constraints shape it:

- **It must exit zero.** A non-zero exit fails the session outright, so every
  step ends in `|| true` and the script ends in `exit 0`.
- **It must finish in about five minutes**, or the snapshot never builds and
  every session pays the cost again. The two slow halves run in parallel. If it
  still overruns, drop the tools that are cheapest to do without: `aws-cli`
  first, then the `go:` backends, which compile from source.

Changing the script — or the allowed domains — invalidates the snapshot, so the
next session rebuilds it. The cache also expires on its own after about a week.

## If the toolchain comes up short

The GitHub proxy scopes release-asset downloads to the repositories attached to
the session, so a setup script fetching golangci-lint, buf or gofumpt from
their GitHub releases can get a 403 where the same URL works from a laptop. Go
itself is safe: it comes through `proxy.golang.org`.

The fix is the environment's **Custom** network access with the defaults kept
and these added:

```text
mise.run
mise.jdx.dev
nodejs.org
```

Ask a session to run `mise ls` to see which tools actually landed.

## Verifying a change

Trigger the routine by hand rather than waiting four hours, and read the run
log — the environment lines at the top say whether the setup script ran and
whether the snapshot was reused.
