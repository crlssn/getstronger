#!/usr/bin/env bash
set -euo pipefail

# Starts what a cloud session's image ships but leaves stopped: the Docker
# daemon the Go suites' test containers connect to, and the .env the database
# tasks read. A local session has both already, so this exits at once outside
# the cloud.
#
# The environment's setup script cannot do this instead. Its snapshot keeps the
# files a session installs and none of the processes, so every session starts
# with Docker on disk and nothing listening. See .claude/cloud-environment.md
# for the setup script that puts the tools there in the first place.
#
# A session that fails to start is worse than one without a database, so no
# step here may fail: each reports what happened and the hook always exits 0.

# Set in cloud sessions only, which is what makes this safe to run everywhere.
[[ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ]] || exit 0

readonly root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# 'service docker start' returns before the socket accepts connections, so the
# daemon is polled rather than assumed. Tests shorten the wait.
readonly wait_seconds="${CLOUD_DOCKER_WAIT:-15}"

notes=()

docker_ready() {
  docker info >/dev/null 2>&1
}

# The image ships dockerd with no init script behind it, so 'service docker
# start' fails there and the daemon has to be launched directly. The service
# call stays as the first try for an image that does wire one up.
launch_dockerd() {
  local log="${TMPDIR:-/tmp}/dockerd.log"

  if [[ "$(id -u)" -eq 0 ]]; then
    dockerd >"$log" 2>&1 &
  elif command -v sudo >/dev/null 2>&1; then
    sudo dockerd >"$log" 2>&1 &
  else
    return 1
  fi
}

start_docker() {
  if docker_ready; then
    notes+=("Docker already up")
    return
  fi

  if ! service docker start >/dev/null 2>&1 && ! launch_dockerd; then
    notes+=("Docker would not start")
    return
  fi

  for _ in $(seq "$wait_seconds"); do
    if docker_ready; then
      notes+=("Docker started")
      return
    fi
    sleep 1
  done

  notes+=("Docker started but not answering")
}

write_env() {
  if [[ -f "$root/.env" || ! -f "$root/.env.example" ]]; then
    return
  fi

  if cp "$root/.env.example" "$root/.env"; then
    notes+=(".env written from .env.example")
  else
    notes+=(".env could not be written")
  fi
}

start_docker
write_env

printf 'Cloud session: %s\n' "$(
  IFS=';'
  echo "${notes[*]}"
)"
exit 0
