#!/bin/bash
#
# Opens a pull request authored by the GitHub App rather than by whoever runs
# this. GitHub refuses a self-approval, so a pull request opened with your own
# token can never satisfy the one approval the ruleset asks for on main.
#
# The push stays yours. Only the pull request is opened with the app token:
# commits the app authors count as unattributed changes, and the ruleset then
# wants a second approval that nobody can give.
#
# Without the app's key to hand, the 'pr open' workflow opens it as the app
# instead, so a cloud routine gets the same author as a laptop does.

set -uo pipefail

readonly TITLE="${1:-}"
readonly BODY_FILE="${2:-}"
shift $(($# < 2 ? $# : 2)) # leaves only the flags, however few positionals came in

fail() {
  echo "pr_create: $1" >&2
  exit 1
}

base=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      base="${2-}"
      [ -n "$base" ] || fail "no base branch given after --base"
      shift 2
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done
readonly base

[ -n "$TITLE" ] || fail "no title given"
[ -n "$BODY_FILE" ] || fail "no body file given"
[ -r "$BODY_FILE" ] || fail "cannot read the body file at $BODY_FILE"

# A stacked base is usually a branch pushed moments ago, so the likely mistake
# is not having pushed it. gh fails obscurely on that; say what is wrong.
if [ -n "$base" ]; then
  git ls-remote --exit-code --heads origin "$base" >/dev/null 2>&1 ||
    fail "no branch named $base on origin, so push it first"
fi

# Where the token cannot be minted — the cloud routines run behind a proxy
# that refuses the installation-token endpoint — the app opens the pull
# request from the 'pr open' workflow instead, where its key is a repository
# secret. The run is dispatched on the branch, so the branch must be pushed
# and must already carry the workflow file.
open_through_workflow() {
  branch=$(git rev-parse --abbrev-ref HEAD)
  git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1 ||
    fail "no branch named $branch on origin, so push it first"
  gh workflow run pr.open.yml --ref "$branch" \
    -f "title=$TITLE" -F "body=@$BODY_FILE" -f "base=${base:-main}" >/dev/null ||
    fail "could not dispatch the pr open workflow on $branch"

  # The dispatch returns before the run starts, so the pull request is found
  # by polling for it rather than read from the response.
  for _ in $(seq 30); do
    sleep 3
    url=$(gh pr list --head "$branch" --base "${base:-main}" --state open --json url --jq '.[0].url // empty')
    if [ -n "$url" ]; then
      printf '%s\n' "$url"
      return 0
    fi
  done
  fail "the pr open workflow was dispatched but no pull request appeared in 90 seconds; see its run under Actions"
}

# An empty GH_TOKEN does not stop gh, it falls back to the logged-in account
# and opens the pull request as you — the one outcome this script exists to
# prevent, and a silent one. So the token is minted and checked up front,
# before gh is allowed to run at all.
token=$("$(dirname "$0")/gh_app_token.sh")

if [ -n "$token" ]; then
  # Without --base gh targets the default branch, which is right for everything
  # but a stacked pull request, so the flag is only passed when one was given.
  url=$(GH_TOKEN="$token" gh pr create --title "$TITLE" --body-file "$BODY_FILE" ${base:+--base "$base"})
  status=$?
  [ -z "$url" ] || printf '%s\n' "$url"
  [ "$status" -eq 0 ] || exit "$status"
else
  echo "pr_create: no app token here, so the pr open workflow opens the pull request instead" >&2
  url=$(open_through_workflow) || exit 1
  printf '%s\n' "$url"
fi

# 'pr:screenshots' needs the number, which only exists now, so this is the
# first moment anything can name the command in full — and the last before the
# pull request is read. A diff cannot tell that a page's appearance moved, so
# this prompts rather than refuses.
number="${url##*/}"
case "$number" in
  "" | *[!0-9]*) exit 0 ;;
esac

# Read into a variable rather than tested as a pipeline: 'grep -q' exits on
# the first match, and the SIGPIPE that gives the stage above it would fail the
# whole pipeline under pipefail exactly when there was something to report.
moved="$(git diff --name-only "origin/${base:-main}...HEAD" 2>/dev/null |
  grep -E '^web/src/.*\.(tsx|css)$' | grep -v '\.spec\.tsx$')"

if [ -n "$moved" ]; then
  cat <<REMINDER

This branch changes what a page looks like. Publish its before/after evidence
into the body, or the reviewer on GitHub gets words:

  mise run pr:screenshots $number --append

Without a database to photograph — a cloud routine's sandbox — dispatch the
capture instead, and a runner does both:

  gh workflow run pr.screenshots.yml -f number=$number

Adding the 'screenshots' label to the pull request starts the same run.
REMINDER
fi
