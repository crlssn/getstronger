#!/usr/bin/env bash
set -euo pipefail

# Frees what a worktree is holding: the servers listening on its port block and
# its Docker containers. It deletes nothing. The containers are stopped rather
# than removed, so the database keeps whatever it holds and 'mise run db:start'
# brings it back.
#
# Run by hand as 'mise run worktree:clean', and by the SessionEnd hook with
# --session-end, so a chat that ends does not leave a backend, a web server and
# a database running for days. worktree_sweep.sh sources it to free the
# worktrees whose session ended without one.

readonly SLOT_BASE=20000
readonly SLOT_WIDTH=20
readonly SLOT_PORTS=14

# Docker publishes every container's ports itself, so its listener stands for
# the container and 'docker stop' is what releases it. Killing the daemon would
# take every worktree's database down at once.
readonly DOCKER_COMMANDS='com.docker|docker|Docker|vpnkit|dockerd'

quiet=false

note() {
  $quiet || printf '%s\n' "$1"
}

# Git and the filesystem can spell one directory two ways — /var against
# /private/var on macOS — so paths are compared resolved.
resolve() {
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"
}

local_env() {
  awk -F'"' -v key="$2" '$0 ~ "^" key " =" { print $2 }' "$1/mise.local.toml" 2>/dev/null || true
}

# The pids listening on a port, with the command that owns each, read from
# lsof's field output: a 'p' line, then the 'c' line belonging to it.
listeners() {
  local line pid=""
  while IFS= read -r line; do
    case "$line" in
    p*) pid="${line#p}" ;;
    c*) printf '%s %s\n' "$pid" "${line#c}" ;;
    esac
  done < <(lsof -nP -iTCP:"$1" -sTCP:LISTEN -F pc 2>/dev/null || true)
}

# The pids asked to stop, waiting for await_stop to see them out.
stopping=""

request_stop() {
  local pid=$1 command=$2 port=$3
  if [[ "$command" =~ ^($DOCKER_COMMANDS) ]]; then
    return 0
  fi

  # One server holds several ports — IPv4 and IPv6 of the same one included —
  # and is worth one line and one signal.
  if [[ " $stopping" == *" $pid "* ]]; then
    return 0
  fi

  note "  stopped $command (pid $pid) on port $port"
  kill -TERM "$pid" 2>/dev/null || true
  stopping+="$pid "
}

# A server that ignores the polite signal still has to let go of the port, or
# the worktree it belongs to cannot be started again.
await_stop() {
  local pending=$stopping attempt pid survivor
  stopping=""
  [[ -n "$pending" ]] || return 0

  for ((attempt = 0; attempt < ${WORKTREE_KILL_ATTEMPTS:-25}; attempt++)); do
    survivor=false
    for pid in $pending; do
      if kill -0 "$pid" 2>/dev/null; then
        survivor=true
      fi
    done
    $survivor || return 0
    sleep 0.2
  done

  for pid in $pending; do
    if kill -0 "$pid" 2>/dev/null; then
      note "  killed pid $pid, which ignored the request to stop"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
}

# Kills whatever is listening on a slot's block of ports: the backend, the web
# server, the end-to-end and screenshot servers, and Playwright's reports.
free_slot_ports() {
  local base=$((SLOT_BASE + $1 * SLOT_WIDTH)) index port pid command

  for ((index = 0; index < SLOT_PORTS; index++)); do
    port=$((base + index))
    while read -r pid command; do
      [[ -n "$pid" ]] && request_stop "$pid" "$command" "$port"
    done < <(listeners "$port")
  done

  await_stop
}

# Stops the named containers. Docker stops a stopped container without
# complaint, so the running ones are picked out first: a second run has nothing
# to report, where announcing them all reads as though something was still up.
stop_containers() {
  local running name targets=()
  running="$(docker ps --format '{{.Names}}' 2>/dev/null || true)"

  for name in "$@"; do
    if grep -qxF "$name" <<<"$running"; then
      targets+=("$name")
    fi
  done

  ((${#targets[@]})) || return 0

  docker stop "${targets[@]}" >/dev/null 2>&1 || true
  for name in "${targets[@]}"; do
    note "  stopped $name"
  done
}

# Frees the worktree at the given path, printing a line for each thing it
# stopped and nothing at all when it was already idle — a caller says what the
# lines are about, and says it only when there are some.
#
# A checkout with no mise.local.toml has no stack of its own — the main
# checkout, or a worktree that never ran 'mise run worktree:env' — and gets a
# non-zero exit rather than having the defaults, which are the main checkout's,
# acted on.
free_worktree() {
  local path=$1 slot db mailhog
  slot="$(local_env "$path" WORKTREE_SLOT)"
  db="$(local_env "$path" DB_CONTAINER)"
  mailhog="$(local_env "$path" MAILHOG_CONTAINER)"

  if [[ -z "$slot" ]]; then
    return 1
  fi

  free_slot_ports "$slot"

  local containers=()
  [[ -n "$db" ]] && containers+=("$db")
  [[ -n "$mailhog" ]] && containers+=("$mailhog")
  if ((${#containers[@]})); then
    stop_containers "${containers[@]}"
  fi
}

# Prints the lines a caller captured from free_worktree.
note_block() {
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && note "$line"
  done <<<"$1"
}

# The log is a convenience for answering "what stopped my stack?", not a
# record, so it keeps only the recent runs.
trim_log() {
  [[ -f "$1" ]] || return 0
  if (($(wc -l <"$1") > 500)); then
    tail -n 200 "$1" >"$1.trimmed" && mv "$1.trimmed" "$1"
  fi
}

# Sourced by worktree_sweep.sh for the functions above; everything below is
# this script being run on its own.
if [[ -n "${WORKTREE_CLEAN_SOURCE:-}" ]]; then
  return 0
fi

session_end=false
target=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --quiet) quiet=true ;;
  --session-end) session_end=true ;;
  -*)
    echo "❌  Unknown option: $1" >&2
    exit 2
    ;;
  *) target="$1" ;;
  esac
  shift
done

if ! root="$(git -C "${target:-$PWD}" rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌  No working tree at '${target:-$PWD}', so there is no stack to free." >&2
  exit 1
fi

root="$(resolve "$root")"

if $session_end; then
  # The payload arrives on stdin, and a terminal has none to send: reading one
  # anyway holds the hook open until it times out. '/clear' ends a session and
  # starts another in the same worktree, and 'resume' hands it to a session that
  # carries on there, so both keep the stack the next prompt is about to use.
  payload=""
  [[ -t 0 ]] || payload="$(cat)"
  if [[ "$payload" =~ \"reason\"[[:space:]]*:[[:space:]]*\"(clear|resume)\" ]]; then
    exit 0
  fi

  # A hook has nowhere to print, so the summary goes where it can be read after
  # the fact.
  log="$(git -C "$root" rev-parse --path-format=absolute --git-common-dir)/worktree-cleanup.log"
  trim_log "$log"
  exec >>"$log" 2>&1
  echo "--- $(date '+%Y-%m-%d %H:%M:%S') session ended in $root"
fi

# The main checkout has a .git directory; worktrees have a .git file. Its stack
# is the one a developer runs all day and no session of theirs owns it.
if [[ -d "$root/.git" ]]; then
  note "Main checkout, so its stack is left running."
  exit 0
fi

if ! freed="$(free_worktree "$root")"; then
  note "This worktree has no ports or containers of its own, so there is nothing to free.
Run 'mise run worktree:env' if it should have them."
  exit 0
fi

if [[ -z "$freed" ]]; then
  note "Nothing of worktree '$(basename "$root")' was running."
  exit 0
fi

note "Freed worktree '$(basename "$root")':"
note_block "$freed"
