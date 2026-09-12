# Self-hosted runners

The heavy workflows can run on hardware you own instead of GitHub's. On a
public repository that buys nothing — hosted runners are free. On a private one
it is the difference between roughly $250 a month and nothing, because this
repository runs about 30 job-hours a day and GitHub bills a private repository
per minute.

Nothing here is required. Every workflow falls back to a GitHub-hosted runner
when the repository variables below are unset, which is also how you turn the
whole thing off again.

## The two pools

`runs-on` reads two repository variables:

| Variable       | Default      | Runs                                                              |
| -------------- | ------------ | ----------------------------------------------------------------- |
| `RUNNER_LINUX` | `ubuntu-latest` | e2e, web, server, proto, workflows, database, screenshots, Android |
| `RUNNER_MACOS` | `macos-26`   | The iOS unit tests in `test.mobile.yml`                            |

Three workflows deliberately ignore both and stay on GitHub's runners:

- **`deploy.yml`** — a deploy must not wait for a machine at home to wake up.
- **`pr.open.yml`** — same, and it is one minute long.
- **`release.mobile.yml`** — the Android jobs are rare, and the iOS job needs
  Xcode 26, which needs macOS 26. See the comment in that file.

Together they come to roughly 1,100 minutes a month, inside the 3,000 a GitHub
Pro account includes. The point of the split is that the machine at home can be
asleep, broken, or halfway through an OS update without blocking a release.

## What the host has to be

A Mac cannot run the Linux pool. GitHub Actions' `container:` and `services:`
keys are Linux-only, and `test.e2e.yml` uses both — the Playwright image and a
Postgres service. A macOS runner will refuse those jobs, not run them slowly.
So the Linux pool lives in a Linux VM, even when the metal underneath is a Mac.

An Intel Mac is an advantage here: the VM runs x86-64 natively, so the
`mcr.microsoft.com/playwright:*-noble` image needs no emulation.

Budget for the VM:

- **16 GB RAM** on the host, of which 8 GB to the VM. Two Playwright shards, a
  Postgres, a Go build and a Vite server share it. 8 GB total will swap.
- **100 GB free disk.** The Playwright image alone is about 2 GB, before Go and
  Node caches and the workspaces.
- **4 cores.** Fewer, and drop the e2e matrix in `test.e2e.yml` to one shard.

Sustained load is the normal state, not a spike. The machine will run warm.

## Linux pool

Install Lima and start an Ubuntu VM:

```sh
brew install lima
limactl start --name=ci --cpus=4 --memory=8 --disk=100 template://ubuntu-24.04
limactl shell ci
```

Everything below runs inside that shell. Install Docker and let the runner user
reach it:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
```

Now register the runners. Open **Settings → Actions → Runners → New self-hosted
runner** on the repository and pick Linux x64: that page prints the current
download URL and a registration token, both of which expire, so take them from
there rather than from here. Run its `mkdir`, `curl` and `tar` steps, then
configure with a label of your own instead of its `./config.sh` line:

```sh
./config.sh --url https://github.com/crlssn/getstronger \
  --token <TOKEN> --labels getstronger-linux --name ci-1 --unattended
sudo ./svc.sh install && sudo ./svc.sh start
```

Repeat in a second directory with `--name ci-2` and a fresh token for the
second runner, so the two e2e shards can run at once. One runner takes one job
at a time; the shard count in `test.e2e.yml` and the number of runners here
should move together.

Reclaim what Docker leaves behind, or the disk fills in a few weeks:

```sh
(crontab -l 2>/dev/null; echo '0 4 * * * docker system prune -af --filter until=168h') | crontab -
```

Finally, have the VM come back after a reboot — `limactl start ci` from a
launchd agent on the host, or `limactl edit ci` and set it to start on login.

## macOS pool

Only the `swift test` job uses this, and it needs no Docker. On the host,
install Xcode from the App Store, then:

```sh
sudo xcode-select -s /Applications/Xcode.app
swift test --help >/dev/null && echo ok
```

Register a runner from the same Settings page, picking macOS, with
`--labels getstronger-macos`, then `./svc.sh install && ./svc.sh start`.

`svc.sh` on macOS installs a **LaunchAgent**, which runs only while the user is
logged in. On a headless box, enable automatic login in System Settings →
Users & Groups, or the runner will be offline after every reboot.

A 2018 Mac mini stops at macOS Sequoia, so this pool is good for the unit tests
and cannot build a release. `release.mobile.yml` stays on GitHub's `macos-26`
for that reason.

## Turning it on

Set the repository variables under **Settings → Secrets and variables →
Actions → Variables**:

```
RUNNER_LINUX = getstronger-linux
RUNNER_MACOS = getstronger-macos
```

The next workflow run picks them up. Nothing needs merging.

## Turning it off

Delete the two variables. Every job goes back to `ubuntu-latest` and `macos-26`
on the next run. Do this before a holiday, or whenever the box is down for
longer than a queued job should wait — a job targeting a label with no online
runner waits rather than failing, and blocks the merge behind it.

## If the repository ever goes public again

Take the runners offline first. A public repository will run a workflow from a
fork's pull request, and that workflow would execute on a machine holding this
repository's secrets on your home network. GitHub's warning about this is not
boilerplate.
