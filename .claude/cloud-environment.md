# The cloud environment

The routines run in an Anthropic-hosted cloud session, not a worktree on a
developer machine. This file records what that image gives us, what it does
not, and the setup script that closes the gap. Everything here was observed in
run `cse_01JfKwBKUTNFftWL1iB2dL7X`, not read off the documentation, which is
wrong about `gh`.

## What the image already has

Docker (`docker`, `dockerd`, `docker compose`), PostgreSQL 16, Redis 7, Go,
Node 20–22, bun 1.3.11, `git`, `jq`, `ripgrep`. Four vCPUs, 16 GB of memory,
30 GB of disk.

Docker and Postgres are installed but **not running**, and there is no init
script behind `dockerd`, so `service docker start` fails and the daemon has to
be launched directly. That is what `scripts/cloud_session_start.sh` does as a
SessionStart hook: the environment's snapshot keeps installed files and no
running process, so every session starts the daemon itself.

With the daemon up and the registry host below allowlisted, the Docker-backed
suites run here: `go test ./...` came back clean over 36 packages in run
`cse_015Mp4AonZEeaffAmmuDvEGC`.

## What it does not have

- **`mise`**, which every rule in this repository is written in terms of.
- **`gh`.** The documentation's table lists it; the image does not have it.
  Anything reaching for `gh` needs the GitHub MCP tools instead.
- **A bun that reads our lockfile.** The image's 1.3.11 rejects the root
  `bun.lock` — `lockfileVersion: 2` against `web/bun.lock`'s 3 — so the setup
  script installs the pinned 1.4.0 from npm.

## What the network allows

The environment runs **Custom** access with the defaults kept, plus:

```text
production.cloudfront.docker.com
buf.build
nodejs.org
dl.google.com
mise-versions.jdx.dev
```

The first line is not optional. Docker Hub's own hosts are on the default list,
but the layer blobs come from `production.cloudfront.docker.com` — note
*cloudfront*, where the default list carries `production.cloudflare.docker.com`
— so without it `docker pull postgres:16.4-alpine` authenticates and then fails
on the first blob, and every testcontainers suite with it.

`buf.build` is what buf's remote plugins need; without it `mise run gen:protos`
reports that the remote is unavailable.

`dl.google.com` is where mise fetches Go, and it matters more than one tool.
Several tasks resolve a binary through `mise which`, which only ever finds what
mise installed — `lint:backend`, `db:seed` and `db:migrate` all do — so a tool
on `PATH` does not satisfy them. With a Go of its own, mise can also build the
five `go:` tools in `mise.toml` through `proxy.golang.org`, which brings
`migrate`, `bobgen-psql`, `mockgen`, `goimports` and `tobari` within reach.
`mise-versions.jdx.dev` is mise's version index; without it every lookup burns
a retry burst against the proxy before continuing.

What this still does not fix is `golangci-lint`, `buf` and `gofumpt`. They are
plain registry tools, so mise takes them from GitHub releases whatever the
allowlist says, and `mise run lint:backend` stays out of reach here. Moving
them to mise's `go:` backend would fix that at the cost of compiling them on
every developer's machine, which is not obviously the better trade.

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
export PATH="/root/go/bin:$PATH"
# 'go install' otherwise picks the oldest toolchain each module allows, and a
# golangci-lint built by Go 1.26 refuses .golangci.yml for targeting 1.27.1.
export GOTOOLCHAIN=go1.27.1

# npm is the only route that works: mise.run is not allowlisted, and the
# GitHub proxy scopes release assets to the repositories attached to a session.
npm install -g mise bun@1.4.0 || true
mise trust "$repo/mise.toml" || true

docker pull postgres:16.4-alpine &

# Every pinned tool that mise fetches from a GitHub release is unreachable
# here, and every one of them is a Go program, so they come through
# proxy.golang.org instead — the one host the agent proxy never touches.
for tool in \
  github.com/bufbuild/buf/cmd/buf@v1.72.0 \
  github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.13.2 \
  mvdan.cc/gofumpt@v0.10.0 \
  golang.org/x/tools/cmd/goimports@v0.48.0 \
  go.uber.org/mock/mockgen@v0.6.0; do
  go install "$tool" &
done

wait
mise --version || true
exit 0
```

Two constraints shape it:

- **It must exit zero.** A non-zero exit fails the session outright, so every
  step ends in `|| true` and the script ends in `exit 0`.
- **It must finish in about five minutes**, or the snapshot never builds and
  every session pays the cost again. The installs run in parallel. If it still
  overruns, drop `mockgen` and `goimports` first — `go generate` and the
  formatter are the checks a run can most easily do without.

Changing the script — or the allowed domains — invalidates the snapshot, so the
next session rebuilds it. The cache also expires on its own after about a week.

## Verifying a change

Trigger the routine by hand rather than waiting four hours, and read the run
log: the environment lines at the top say whether the setup script ran, and
`ls /root/go/bin` plus `mise ls` say what actually landed.
