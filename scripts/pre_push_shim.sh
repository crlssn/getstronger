#!/bin/bash
#
# Installed as the pre-push hook by 'mise run install:hooks'. It holds no
# checks of its own: it hands the push to scripts/pre_push_hook.sh in the
# repository, so editing that script changes the next push and the hook can
# never lag behind the tree.
#
# The script is resolved through Git rather than from a path baked in at
# install time, because one hooks directory is shared by the main checkout and
# every linked worktree, and each has to run its own copy.
#
# It fails open. When the script is missing or not executable — an old commit
# checked out, a bisect in progress — the push goes ahead with a warning: a
# hook that blocks a push over which commit happens to be checked out is worse
# than one that skips.

set -uo pipefail

YELLOW='\033[0;33m'
NO_COLOUR='\033[0m'

root=$(git rev-parse --show-toplevel 2>/dev/null)
script="$root/scripts/pre_push_hook.sh"

if [[ -z "$root" || ! -x "$script" ]]; then
  echo -e "⚠️  ${YELLOW}No executable scripts/pre_push_hook.sh here. Skipping the pre-push checks.${NO_COLOUR}"
  exit 0
fi

exec "$script" "$@"
