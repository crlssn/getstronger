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

`dl.google.com` is where mise fetches Go, and without it `mise run` does not
work at all. Every task installs its missing tools first, each `go:` tool in
`mise.toml` depends on that Go, and one unreachable dependency fails the task
before it starts — even `vet:go`, which is only `go vet ./...`:

```
go:go.uber.org/mock/mockgen@v0.6.0: Skipped due to failed dependency
mise ERROR
```

Until it was allowed, that is why sessions here reached for `go` and `buf`
directly, against the rule that everything runs through `mise run`. The tasks
resolving a binary with
`mise which` — `lint:backend`, `db:seed`, `db:migrate` — fail for the same
reason twice over, since a tool on `PATH` never satisfies it. With a Go of its
own, mise can also build the five `go:` tools through `proxy.golang.org`, which
brings `migrate`, `bobgen-psql`, `mockgen`, `goimports` and `tobari` within
reach.
`mise-versions.jdx.dev` is mise's version index; without it every lookup burns
a retry burst against the proxy before continuing.

What this still does not fix is `golangci-lint`, `buf` and `gofumpt`. They are
plain registry tools, so mise takes them from GitHub releases whatever the
allowlist says, and `mise run lint:backend` stays out of reach here. Moving
them to mise's `go:` backend would fix that at the cost of compiling them on
every developer's machine, which is not obviously the better trade.

## Environment variables

The **Environment variables** field carries these two:

```text
MISE_GITHUB_ATTESTATIONS=false
MISE_AQUA_GITHUB_ATTESTATIONS=false
```

mise checks a tool's GitHub attestation and SLSA provenance before installing
it, and those checks call the GitHub API. The session's GitHub proxy scopes API
access to the repositories attached to the session, so a check against
`jdx/mise` or `stephenafamo/bob` comes back with `GitHub access to this
repository is not enabled for this session` and the install fails. No allowlist
entry fixes it — the proxy is doing exactly what it is there for — so without
these, `mise run install:js` fails on a fresh session.

Turning the checks off is a genuine reduction in what this sandbox verifies,
and worth naming rather than burying. Two things bound it: the reduction stops
at the sandbox, since a developer machine reads none of this, and the tools
that actually install here arrive through `proxy.golang.org`, whose downloads
are still checked against `sum.golang.org`. The GitHub-released tools the
attestations would have covered are unreachable here for other reasons anyway.

Anyone who can use the environment can read its variables, so nothing secret
belongs in this field. Neither of these is a secret.

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

## Reading another session's run log

A session here cannot. The routines' logs are readable in the web UI and by
nothing this sandbox has. Observed in run `cse_0197dyrqyJWSHfPSJJVgdbor`:

- **`RemoteTrigger` is not available.** `ToolSearch` with
  `select:RemoteTrigger` answers `No matching deferred tools found`, and so do
  keyword searches for a run-log tool.
- **The `Claude_Code_Remote` connector has no log reader.** It lists routines
  with `list_triggers` and returns a session's *record* with `get_session` —
  title, status, branches, token and cost totals — and stops there. No
  transcript, no tool calls, no output. It has no `list_runs`, `get_run_log` or
  `list_events`, and `ListMcpResourcesTool` reports it serves no resources
  either.
- **`list_sessions` does not even enumerate the runs.** Trigger-fired sessions
  are absent from its listing, and the `tags` filter that would select them is
  documented as refused for an in-session caller.

What is reachable is the shape of a run, not its contents: `list_triggers`
carries each routine's `last_run` — status, timestamps, session id — and
`get_session` adds that session's cost, context usage and any
`post_turn_summary`. Anything needing the log itself has to be read by a person.

## Verifying a change

Trigger the routine by hand rather than waiting four hours, and read the run
log **in the web UI**, not from a session here: the environment lines at the top
say whether the setup script ran, and `ls /root/go/bin` plus `mise ls` say what
actually landed.
