#!/usr/bin/env bash
set -euo pipefail

# Removes the screenshot sets left behind by branches that no longer exist.
# A set is 32 MB and keyed by the ref it was photographed on, so they accumulate
# one per branch and nothing else ever clears them — keying them is what stopped
# every run from clearing the others by accident.
#
# Lists what it found by default. --force is what removes it, because a set is
# six minutes of photographing and may be the baseline of a comparison in
# progress.

force=false
if [[ "${usage_force:-}" == "true" || "${1:-}" == "--force" ]]; then
  force=true
fi

source "$(dirname "${BASH_SOURCE[0]}")/screenshots_ref.sh"

if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌  Not in a Git working tree, so there are no branches to compare against." >&2
  exit 1
fi

sets="$root/web/screenshots"

# The copy-aside a comparison read its before column from before sets were keyed
# by ref. Nothing writes one any more, so a machine that has one is holding
# 32 MB no task will ever look at again.
retired="$root/web/.screenshots-baseline"
[[ -d "$retired" ]] || retired=""

# Every ref that could still be photographed against, as directory names: the
# local branches, the remote-tracking ones a baseline may have been captured on,
# and whatever HEAD is now — a detached HEAD's short SHA has no branch behind it
# and would otherwise be pruned out from under the run using it.
live_directories() {
  ref_directory "$(current_ref)"
  git for-each-ref --format='%(refname:short)' refs/heads refs/remotes 2>/dev/null |
    while read -r ref; do
      ref_directory "$ref"
    done
}

photographed() {
  [[ -d "$sets" ]] || return 0
  find "$sets" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

live="$(live_directories | sort -u)"

stale=""
while read -r directory; do
  [[ -n "$directory" ]] || continue
  if ! grep -qxF "$directory" <<<"$live"; then
    stale+="$directory"$'\n'
  fi
done < <(photographed)

stale="$(printf '%s' "$stale" | sed '/^$/d')"

if [[ -z "$stale" && -z "$retired" ]]; then
  echo "✅  No sets left behind: every set under web/screenshots belongs to a ref that still exists."
  exit 0
fi

size() { du -sh "$1" | cut -f1; }

if ! $force; then
  echo "Sets whose ref is gone:"
  [[ -z "$stale" ]] || while read -r directory; do
    echo "  web/screenshots/$directory ($(size "$sets/$directory"))"
  done <<<"$stale"
  [[ -z "$retired" ]] ||
    echo "  web/.screenshots-baseline ($(size "$retired")) — the copy-aside that keying by ref replaced"
  echo
  echo "Each is six minutes of photographing. Remove them with:"
  echo "  mise run screenshots:prune -- --force"
  exit 0
fi

removed=0

[[ -z "$stale" ]] || while read -r directory; do
  echo "Removing web/screenshots/$directory"
  rm -rf "${sets:?}/$directory"
  removed=$((removed + 1))
done <<<"$stale"

if [[ -n "$retired" ]]; then
  echo "Removing web/.screenshots-baseline"
  rm -rf "${retired:?}"
  removed=$((removed + 1))
fi

echo "✅  Removed $removed set(s)."
