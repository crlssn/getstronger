#!/bin/bash
#
# Runs the checks for the areas this push changes: a web-only push never starts
# a Postgres container, and a server-only push never builds the web app. CI
# runs everything again on the pull request, so the hook only has to be fast
# enough that nobody reaches for --no-verify.
#
# Git runs this through the shim installed as the pre-push hook, so an edit
# here takes effect on the next push with no reinstall. The shim skips the
# checks when this script is missing or not executable.
#
# Git hands a pre-push hook one line per pushed ref on stdin:
#   <local ref> <local sha> <remote ref> <remote sha>
# Run by hand, with nothing on stdin, it checks the checked-out branch instead.

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NO_COLOUR='\033[0m'

ZEROES='^0+$'

WEB_PATHS='^web/'
BACKEND_PATHS='^(server/|scripts/|database/migrations/|go\.mod$|go\.sum$|\.golangci\.yml$)'
PROTO_PATHS='^(proto/|buf\.(yaml|gen\.yaml|lock)$|protolint\.yml$)'

# The suite is the reason to run the hook at all, so it tests the code being
# pushed rather than reporting a pass Go cached from an earlier run. Commands
# that do not know the flag ignore it.
export GOFLAGS="-count=1${GOFLAGS:+ $GOFLAGS}"

# base_ref names the branch a new branch is compared against: what the remote
# already has once it is pushed.
base_ref() {
  git symbolic-ref --quiet --short refs/remotes/origin/HEAD && return
  for ref in origin/main main; do
    if git rev-parse --verify --quiet "$ref" >/dev/null; then
      echo "$ref"
      return
    fi
  done
}

files_pushed() {
  local remote_sha=$1 local_sha=$2 base
  # Git sends all zeroes for a branch the remote does not have yet, and the
  # hand-run path sends nothing at all: both compare against the base branch.
  if [[ -z "$remote_sha" || "$remote_sha" =~ $ZEROES ]]; then
    base=$(git merge-base "$(base_ref)" "$local_sha" 2>/dev/null)
  else
    base=$remote_sha
  fi

  if [[ -n "$base" ]]; then
    git diff --name-only "$base" "$local_sha"
  else
    # Nothing in common with the base, so there is no diff to narrow the checks
    # down with: treat every file as changed rather than checking none of them.
    git ls-tree -r --name-only "$local_sha"
  fi
}

changed_files() {
  local local_ref local_sha remote_ref remote_sha refs=0

  # Nothing will arrive on a terminal, and reading from one would hang.
  if [[ -t 0 ]]; then
    files_pushed "" HEAD
    return
  fi

  while read -r local_ref local_sha remote_ref remote_sha; do
    refs=1
    [[ "$local_sha" =~ $ZEROES ]] && continue # A deleted branch has nothing to check.
    files_pushed "$remote_sha" "$local_sha"
  done
  ((refs)) || files_pushed "" HEAD
}

# Not a pipe: 'grep -q' stops at the first match, and the writer left holding a
# broken pipe fails the pipeline under 'set -o pipefail' — an area that was
# changed reported untouched, and its checks skipped.
touches() {
  grep -qE "$1" <<<"$CHANGED"
}

abort() {
  echo -e "⚠️ ${RED}$1${NO_COLOUR}"
  echo "$2"
  echo "Run 'git push --no-verify' to bypass this check."
  exit 1
}

check() {
  local description=$1 task=$2
  echo "$description..."
  mise run "$task" >/dev/null ||
    abort "$description failed. Aborting push." "Run 'mise run $task' to see the failures."
}

echo "Running pre-push hook"

CHANGED=$(changed_files | sort -u)

web=false
backend=false
protos=false
touches "$WEB_PATHS" && web=true
touches "$BACKEND_PATHS" && backend=true
touches "$PROTO_PATHS" && protos=true

if ! $web && ! $backend && ! $protos; then
  echo -e "✅  ${GREEN}Nothing pushed under web, server, or proto. Pushing changes.${NO_COLOUR}"
  exit 0
fi

$web && check "Formatting web code" format:web
$backend && check "Formatting backend code" format:backend

if [[ $(git status --porcelain) ]]; then
  abort "Uncommitted changes found. Aborting push." "Run 'git diff' to see uncommitted changes."
fi

$web && check "Linting web code" lint:web
$backend && check "Linting backend code" lint:backend
$protos && check "Linting protos" lint:protos

$web && check "Testing the web app" test:web
$backend && check "Testing the backend" test:backend

echo -e "✅  ${GREEN}All checks passed. Pushing changes.${NO_COLOUR}"
exit 0
