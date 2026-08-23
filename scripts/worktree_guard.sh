#!/usr/bin/env bash
set -euo pipefail

# Refuses to run a task that would touch the wrong stack. A worktree with no
# mise.local.toml does not fail loudly: it inherits the [env] defaults in
# mise.toml, which are the main checkout's. 'mise run db:clean' from there
# deletes the main checkout's database container, and 'mise run db:seed'
# reseeds its data.
#
# Run as the first step of the tasks that create, wipe, or remove state.

if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "❌  No working tree here, so there is no stack to act on.
'git rev-parse --show-toplevel' failed. In a checkout that plainly has files the
usual cause is core.bare = true in the shared .git/config; run
'mise run worktree:env' to move it where it belongs." >&2
  exit 1
fi

# The main checkout has a .git directory; worktrees have a .git file. The
# defaults are the main checkout's own, so there they are correct.
if [[ -d "$root/.git" ]]; then
  exit 0
fi

# Both are set by mise.local.toml, so either one missing means the same thing.
# The container is checked as well as the slot because a mise.local.toml
# written before the containers were named per worktree still names the
# shared one.
if [[ -n "${WORKTREE_SLOT:-}" && "${DB_CONTAINER:-getstronger}" != "getstronger" ]]; then
  exit 0
fi

echo "❌  This worktree has no ports, database, or containers of its own, so this
task would act on the main checkout's stack: DB_CONTAINER is
'${DB_CONTAINER:-getstronger}' and MAILHOG_CONTAINER is
'${MAILHOG_CONTAINER:-getstronger-mailhog}'.

Run 'mise run worktree:env' first." >&2
exit 1
