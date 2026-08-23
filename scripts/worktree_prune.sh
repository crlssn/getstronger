#!/usr/bin/env bash
set -euo pipefail

# Removes the containers left behind by worktrees that no longer exist.
# 'git worktree remove' knows nothing about Docker, so every removed worktree
# leaves its Postgres and MailHog running. Beyond the disk and daemon load,
# they corrupt slot assignment in both directions: a running orphan holds a
# port block no worktree will ask for again, and a stopped one hides the block
# it would take back on start.
#
# Lists what it found by default. --force is what removes it, because the
# databases are the only copy of whatever those worktrees were doing.

force=false
if [[ "${usage_force:-}" == "true" || "${1:-}" == "--force" ]]; then
  force=true
fi

if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌  Not in a Git working tree, so there is nothing to compare against." >&2
  exit 1
fi

resolve() {
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"
}

root="$(resolve "$root")"

# A checkout counts as live while its directory exists, registered with Git or
# not: a directory a developer can still cd into is not an orphan, and its
# database is not this task's to delete.
live_names() {
  local path sibling
  while read -r path; do
    if [[ -d "$path" ]]; then
      basename "$path"
    fi
  done < <(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{ print substr($0, 10) }')

  for sibling in "$(dirname "$root")"/* "$root/.claude/worktrees"/*; do
    if [[ -d "$sibling" ]]; then
      basename "$sibling"
    fi
  done
}

live="$(live_names | sort -u)"

# Containers are named getstronger-<worktree>[-<slot>] and
# getstronger-mailhog-<worktree>[-<slot>].
has_live_owner() {
  local suffix=$1 name
  while read -r name; do
    case "$suffix" in
    "$name") return 0 ;;
    "$name"-*)
      if [[ "${suffix##*-}" =~ ^[0-9]+$ && "${suffix%-*}" == "$name" ]]; then
        return 0
      fi
      ;;
    esac
  done <<<"$live"
  return 1
}

orphans=""
while read -r container; do
  case "$container" in
  "" | getstronger | getstronger-mailhog) continue ;; # The main checkout's own.
  getstronger-*) ;;
  *) continue ;;
  esac

  suffix="${container#getstronger-}"
  suffix="${suffix#mailhog-}"
  if ! has_live_owner "$suffix"; then
    orphans+="$container"$'\n'
  fi
done < <(docker ps -a --format '{{.Names}}' 2>/dev/null || true)

orphans="$(printf '%s' "$orphans" | sed '/^$/d')"

if [[ -z "$orphans" ]]; then
  echo "✅  No containers left behind: every getstronger container belongs to a checkout that still exists."
  exit 0
fi

if ! $force; then
  echo "Containers whose worktree is gone:"
  printf '%s\n' "$orphans" | sed 's/^/  /'
  echo
  echo "Their databases hold whatever those worktrees were doing. Remove them with:"
  echo "  mise run worktree:prune -- --force"
  exit 0
fi

while read -r container; do
  echo "Removing $container"
  docker rm -f "$container" >/dev/null
done <<<"$orphans"

echo "✅  Removed $(printf '%s\n' "$orphans" | wc -l | tr -d ' ') container(s)."
