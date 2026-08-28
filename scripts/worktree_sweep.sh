#!/usr/bin/env bash
set -euo pipefail

# Frees the resources of the worktrees that are done with them: the ones whose
# directory is gone, and the ones whose pull request has been merged. It stops
# servers and containers and removes nothing, so a worktree swept by mistake
# starts again with 'mise run db:start'.
#
# Run at the start of a session, where it catches what nothing else can: a
# session that ended without its hook running, and a pull request that merged
# on GitHub while nothing was running here to notice.

# Stopping a container and killing a port is worktree_clean.sh's job, and one
# copy of it stays honest where two would drift. SLOT_BASE and SLOT_WIDTH come
# from there too.
WORKTREE_CLEAN_SOURCE=1 source "$(dirname "${BASH_SOURCE[0]}")/worktree_clean.sh"

readonly SLOT_COUNT=99

# The servers a worktree runs, under the names lsof gives them: the backend
# 'go run' builds, Vite, Playwright, and the package managers that start them.
# The slot block belongs to this repository, but a program of the developer's
# own can still be listening inside it, and stopping that is not the sweep's
# business.
readonly STACK_COMMANDS='main|node|bun|npm|go|esbuild'

detach=false

while [[ $# -gt 0 ]]; do
  case "$1" in
  --quiet) quiet=true ;;
  --detach) detach=true ;;
  *)
    echo "❌  Unknown option: $1" >&2
    exit 2
    ;;
  esac
  shift
done

if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌  Not in a Git working tree, so there is nothing to sweep." >&2
  exit 1
fi

root="$(resolve "$root")"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(resolve "$(dirname "$common_dir")")"

# Asking GitHub about a branch takes a second, and a session should not wait
# for one per worktree before its first prompt. The log is where the answer to
# "what stopped my stack?" lives.
if $detach; then
  trim_log "$common_dir/worktree-cleanup.log"
  nohup "${BASH_SOURCE[0]}" >>"$common_dir/worktree-cleanup.log" 2>&1 &
  exit 0
fi

note "--- $(date '+%Y-%m-%d %H:%M:%S') sweep from $root"

worktrees() {
  git worktree list --porcelain 2>/dev/null |
    awk '/^worktree /{ print substr($0, 10) }' || true
}

# The worktrees whose pull request has merged. Never the one the session is
# working in: a merged branch is no reason to stop the stack the developer is
# looking at right now.
merged_worktrees() {
  local path branch state
  while read -r path; do
    [[ -n "$path" ]] || continue
    path="$(resolve "$path")"
    [[ -d "$path" && "$path" != "$root" && "$path" != "$main_root" ]] || continue
    [[ -f "$path/mise.local.toml" ]] || continue

    branch="$(git -C "$path" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    [[ -n "$branch" && "$branch" != "HEAD" ]] || continue

    # No answer means no sweep. gh missing, signed out, or offline is
    # indistinguishable from a branch with no pull request, and a guess here
    # stops a stack that is still in use.
    state="$(cd "$path" && gh pr view "$branch" --json state --jq .state 2>/dev/null || true)"
    if [[ "$state" == "MERGED" ]]; then
      printf '%s\n' "$path"
    fi
  done < <(worktrees)
}

# Everything a developer can still cd into, registered with Git or not: a
# directory that is there is not an orphan, whatever Git thinks of it.
live_paths() {
  local path sibling
  while read -r path; do
    [[ -d "$path" ]] && printf '%s\n' "$path"
  done < <(worktrees)

  for sibling in "$(dirname "$main_root")"/* "$main_root/.claude/worktrees"/*; do
    [[ -d "$sibling" ]] && printf '%s\n' "$sibling"
  done
}

live_names() {
  local path
  while read -r path; do
    basename "$path"
  done < <(live_paths)
}

# The slots the checkouts that are still there hold. Everything else in the
# block was left by a worktree that is gone.
claimed_slots() {
  local path slot
  while read -r path; do
    slot="$(local_env "$path" WORKTREE_SLOT)"
    [[ -n "$slot" ]] && printf '%s\n' "$slot"
  done < <(live_paths)
}

# Servers holding a slot no checkout claims. They outlive their containers:
# 'mise run worktree:prune' takes the containers away and leaves the backend
# that was talking to them running, with nothing left to name the slot.
stray_servers() {
  local claimed line pid="" command="" port slot
  claimed="$(claimed_slots | sort -u)"

  while IFS= read -r line; do
    case "$line" in
    p*) pid="${line#p}" ;;
    c*) command="${line#c}" ;;
    n*)
      port="${line##*:}"
      [[ "$port" =~ ^[0-9]+$ ]] || continue
      slot=$(((port - SLOT_BASE) / SLOT_WIDTH))
      ((port >= SLOT_BASE && slot >= 1 && slot <= SLOT_COUNT)) || continue
      grep -qx "$slot" <<<"$claimed" && continue
      [[ "$command" =~ ^($STACK_COMMANDS)$ ]] || continue
      printf '%s %s %s\n' "$pid" "$command" "$port"
      ;;
    esac
  done < <(lsof -nP -iTCP -sTCP:LISTEN -F pcn 2>/dev/null || true)
}

# Containers named getstronger-<worktree>[-<slot>] whose worktree is gone. The
# main checkout's own two are named without a worktree and are never swept.
orphan_containers() {
  local live container ports name suffix
  live="$(live_names | sort -u)"

  while IFS=$'\t' read -r container ports; do
    case "$container" in
    "" | getstronger | getstronger-mailhog) continue ;;
    getstronger-*) ;;
    *) continue ;;
    esac

    suffix="${container#getstronger-}"
    suffix="${suffix#mailhog-}"
    while read -r name; do
      case "$suffix" in
      "$name") continue 2 ;;
      "$name"-*)
        if [[ "${suffix##*-}" =~ ^[0-9]+$ && "${suffix%-*}" == "$name" ]]; then
          continue 2
        fi
        ;;
      esac
    done <<<"$live"

    printf '%s\t%s\n' "$container" "$ports"
  done < <(docker ps --format '{{.Names}}'$'\t''{{.Ports}}' 2>/dev/null || true)
}

# The slot a container publishes into, which is how an orphan's ports are found
# once the mise.local.toml naming them is gone.
slot_of_ports() {
  local port slot
  for port in $(printf '%s' "$1" | tr ',' '\n' | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p'); do
    slot=$(((port - SLOT_BASE) / SLOT_WIDTH))
    if ((port >= SLOT_BASE && slot >= 1 && slot <= SLOT_COUNT)); then
      printf '%s\n' "$slot"

      return 0
    fi
  done
}

swept=false

while read -r path; do
  [[ -n "$path" ]] || continue
  freed="$(free_worktree "$path" || true)"
  [[ -n "$freed" ]] || continue

  swept=true
  note "Pull request merged, so worktree '$(basename "$path")' keeps nothing running:"
  note_block "$freed"
done < <(merged_worktrees)

freed="$(
  while IFS=$'\t' read -r container ports; do
    [[ -n "$container" ]] || continue
    stop_containers "$container"
    slot="$(slot_of_ports "$ports")"
    [[ -n "$slot" ]] && free_slot_ports "$slot"
  done < <(orphan_containers)
)"

if [[ -n "$freed" ]]; then
  swept=true
  note "Worktrees that are gone, whose containers were still running:"
  note_block "$freed"
  note "They still hold their port slots, and their databases are the only copy of
whatever those worktrees were doing. 'mise run worktree:prune' lists them and
'mise run worktree:prune -- --force' removes them."
fi

strays="$(stray_servers)"

if [[ -n "$strays" ]]; then
  swept=true
  note "Servers left behind by worktrees that are gone:"
  while read -r pid command port; do
    [[ -n "$pid" ]] && request_stop "$pid" "$command" "$port"
  done <<<"$strays"
  await_stop
fi

$swept || note "Nothing to sweep: every worktree's stack belongs to work still in flight."
