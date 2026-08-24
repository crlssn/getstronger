#!/bin/bash
#
# Opens a pull request authored by the GitHub App rather than by whoever runs
# this. GitHub refuses a self-approval, so a pull request opened with your own
# token can never satisfy the one approval the ruleset asks for on main.
#
# The push stays yours. Only the pull request is opened with the app token:
# commits the app authors count as unattributed changes, and the ruleset then
# wants a second approval that nobody can give.

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

# An empty GH_TOKEN does not stop gh, it falls back to the logged-in account
# and opens the pull request as you — the one outcome this script exists to
# prevent, and a silent one. So the token is minted and checked up front,
# before gh is allowed to run at all.
token=$("$(dirname "$0")/gh_app_token.sh")
[ -n "$token" ] || fail "no app token, so the pull request would have been opened as you"

# Without --base gh targets the default branch, which is right for everything
# but a stacked pull request, so the flag is only passed when one was given.
GH_TOKEN="$token" gh pr create --title "$TITLE" --body-file "$BODY_FILE" ${base:+--base "$base"}
