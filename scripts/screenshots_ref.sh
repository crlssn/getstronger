#!/usr/bin/env bash
#
# The directory a ref's screenshots live in. Sets are keyed by the ref they were
# photographed on, so a run only ever removes its own and two branches can hold
# a set at once. Sourced by the tasks that have to name the same directory the
# capture wrote to; run on its own it prints the current ref's.
#
# The rule is web/tests/screenshots/ref.ts written twice, because the capture is
# TypeScript and the publishing is shell. scripts/screenshots_test.go is what
# keeps the two in step.

# A ref no directory could be named after. Never empty and never a dot: both
# would resolve to the directory holding every set, which a run then removes.
unnameable_ref="unnamed-ref"

ref_directory() {
  local slug
  slug="$(printf '%s' "${1-}" |
    LC_ALL=C sed -e 's/[^A-Za-z0-9_.-]\{1,\}/-/g' -e 's/^[-.]*//' -e 's/[-.]*$//')"
  printf '%s\n' "${slug:-$unnameable_ref}"
}

# The branch, or the short SHA when HEAD is detached — which is what a baseline
# captured on origin/main actually is.
current_ref() {
  local ref="${SCREENSHOT_REF:-}"
  [ -n "$ref" ] || ref="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)"
  [ -n "$ref" ] || ref="$(git rev-parse --short HEAD 2>/dev/null)"
  printf '%s\n' "${ref:-$unnameable_ref}"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  ref_directory "$(current_ref)"
fi
