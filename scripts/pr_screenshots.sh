#!/bin/bash
#
# Publishes a pull request's screenshots to Object Storage and prints the
# markdown that shows them. GitHub's image uploader is a session-authenticated
# web endpoint, so neither 'gh' nor 'mise run pr:create' can attach an image;
# without this the before/after evidence for a visual change stays in a chat
# reply while the review happens on GitHub.
#
# Only web/screenshots/ may be published. The objects have to be world-readable
# for GitHub's image proxy to fetch them, and that directory is photographed
# from the seeded database by construction — the guard is what keeps real data
# out of a public bucket.
#
# The bucket is not the one the web app is deployed to: that one is synced with
# --delete, so a pr/ prefix in it would disappear on the next merge to main.

set -uo pipefail

# ref_directory and current_ref: a set is keyed by the ref it was photographed
# on, so the default path has to name the same directory the capture wrote to.
. "$(dirname "$0")/screenshots_ref.sh"

# Opens the block, so publishing again replaces the images a reviewer has
# rather than leaving them two sets.
readonly MARKER="<!-- pr:screenshots -->"

fail() {
  echo "pr_screenshots: $1" >&2
  exit 1
}

readonly NUMBER="${1:-}"
shift $(($# < 1 ? $# : 1)) # leaves only the flags, however few positionals came in

path=""
append=""
while [ $# -gt 0 ]; do
  case "$1" in
    --path)
      path="${2-}"
      [ -n "$path" ] || fail "no path given after --path"
      shift 2
      ;;
    --append)
      append=1
      shift
      ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[ -n "$NUMBER" ] || fail "no pull request number given"
case "$NUMBER" in
  *[!0-9]*) fail "'$NUMBER' is not a pull request number" ;;
esac

root="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$root" ] || fail "no working tree here, so there are no screenshots to publish"

[ -n "$path" ] || path="$root/web/screenshots/$(ref_directory "$(current_ref)")/changes"

# Both sides are resolved with 'cd' rather than compared as text, so a symlink
# out of web/screenshots is caught as well as a path that names somewhere else.
directory="$(cd "$path" 2>/dev/null && pwd -P)"
[ -n "$directory" ] || fail "no directory at $path"
publishable="$(cd "$root/web/screenshots" 2>/dev/null && pwd -P)"
[ -n "$publishable" ] || fail "no directory at $root/web/screenshots"

case "$directory" in
  "$publishable" | "$publishable"/*) ;;
  *) fail "$path is outside web/screenshots/, and only what was photographed from the seeded database may go to a public bucket" ;;
esac

# 'screenshots:diff' writes the ref it compared against beside the differences
# it drew, so a directory of differences carries both sets a report is of: the
# one it sits in, and the one named there. Reading that rather than matching the
# path is what lets --path name any run's differences and still show a redesign
# as the two states side by side.
#
# The name comes out of a file, so it is resolved and checked against the same
# guard as --path: only what was photographed from the seeded database may go to
# a public bucket.
before_root=""
after_root=""
comparing=""
if [ -f "$directory/against" ]; then
  against="$(head -n 1 "$directory/against")"
  before_root="$(cd "$root/web/screenshots/$against" 2>/dev/null && pwd -P)"
  after_root="$(cd "$directory/.." 2>/dev/null && pwd -P)"
fi

case "$before_root" in
  "$publishable"/*)
    case "$after_root" in
      "$publishable"/*) comparing=1 ;;
    esac
    ;;
esac

# The pages to publish come from the index 'screenshots:diff' writes rather than
# from the difference images beside it: a page that gained or lost a fold has an
# image on one side only and no difference to draw, and reading the folder alone
# left it out of the very report meant to show it.
images=()
kinds=()
if [ -n "$comparing" ] && [ -f "$directory/pages.tsv" ]; then
  while IFS=$'\t' read -r kind image; do
    [ -n "$image" ] || continue
    kinds+=("$kind")
    images+=("$image")
  done < <(LC_ALL=C sort -k2 "$directory/pages.tsv")
else
  while IFS= read -r image; do
    kinds+=(changed)
    images+=("${image#"$directory"/}")
  done < <(find "$directory" -type f -name '*.png' | LC_ALL=C sort)
fi

[ "${#images[@]}" -gt 0 ] ||
  fail "no images under $path; 'mise run screenshots:diff' writes the pages a change moved"

bucket="${SCW_SCREENSHOTS_BUCKET_NAME:-}"
[ -n "$bucket" ] ||
  fail "SCW_SCREENSHOTS_BUCKET_NAME is not set, so there is no bucket to publish to; see the README's Scaleway section"
readonly bucket
readonly REGION="${SCW_REGION:-fr-par}"

# The upload is the first thing that would reach the network, and the AWS CLI
# reports missing credentials as an obscure SSL error, so say it plainly here.
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ ! -r "${AWS_SHARED_CREDENTIALS_FILE:-$HOME/.aws/credentials}" ]; then
  fail "no Scaleway credentials: put AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env, or configure them with 'aws configure'"
fi

sha="$(git rev-parse --short HEAD 2>/dev/null)"
[ -n "$sha" ] || fail "no commit here, so there is nothing to publish the screenshots under"
readonly sha

readonly PREFIX="pr/$NUMBER/$sha"

# public-read on each object rather than a policy on the bucket: GitHub's image
# proxy fetches anonymously, and an ACL makes exactly what this task uploaded
# readable, leaving the bucket itself private.
#
# Everything goes under a prefix naming the commit, so re-photographing a branch
# adds a set rather than overwriting the one a reviewer may be looking at. The
# lifecycle rule on the bucket is what removes them again.
publish() {
  local source="$1" destination="$2"
  shift 2

  aws s3 sync "$source" "s3://$bucket/$destination" \
    --endpoint-url "https://s3.$REGION.scw.cloud" \
    --acl public-read \
    --exclude "*" \
    "$@" \
    --cache-control "public, max-age=31536000, immutable" \
    --no-progress ||
    fail "the upload failed, so nothing was printed to put in the pull request"
}

image_tag() {
  # Path-style, not virtual-host: the bucket name carries a dot, which the
  # wildcard certificate *.s3.<region>.scw.cloud cannot match, so the
  # virtual-host form fails TLS and every embedded image breaks.
  printf '<img src="https://s3.%s.scw.cloud/%s/%s/%s" width="%s" alt="%s">' \
    "$REGION" "$bucket" "$PREFIX" "$1" "$2" "$3"
}

block="$MARKER

## Screenshots

"

if [ -n "$comparing" ]; then
  # The pages that moved, and only those: the rest of the set is unchanged and
  # would bury them.
  includes=()
  for image in "${images[@]}"; do
    includes+=(--include "$image")
  done

  publish "$directory" "$PREFIX/difference" --include "*.png"
  publish "$after_root" "$PREFIX/after" "${includes[@]}"
  publish "$before_root" "$PREFIX/before" "${includes[@]}"

  block+="| Page | Before | After | Difference |
| --- | --- | --- | --- |
"
  for position in "${!images[@]}"; do
    image="${images[$position]}"
    page="${image%.png}"
    # A third of the 780 px the phone-sized viewport renders at, so the three
    # states sit side by side in a pull request's column.
    before="_not in the baseline_"
    [ -f "$before_root/$image" ] && before="$(image_tag "before/$image" 260 "$page before")"
    after="_removed_"
    [ -f "$after_root/$image" ] && after="$(image_tag "after/$image" 260 "$page after")"
    # A page with only one state has nothing to overlay, and a word says so
    # better than a link to an object that was never uploaded.
    difference="_${kinds[$position]}, nothing to compare_"
    [ -f "$directory/$image" ] && difference="$(image_tag "difference/$image" 260 "$page difference")"

    block+="| \`$page\` | $before | $after | $difference |
"
  done
else
  publish "$directory" "$PREFIX" --include "*.png"

  block+="| Page | Screenshot |
| --- | --- |
"
  for image in "${images[@]}"; do
    # Half of the 780 px the phone-sized viewport renders at, so several fit on
    # a screen and each is still legible at its natural density.
    block+="| \`${image%.png}\` | $(image_tag "$image" 390 "${image%.png}") |
"
  done
fi

# Which two sets the table is of, so a report built against the wrong baseline
# is visible to a reviewer rather than silent.
if [ -n "$comparing" ]; then
  block+="
<sub>\`$(basename "$after_root")\` at $sha, compared against \`$(basename "$before_root")\`.</sub>"
else
  block+="
<sub>Captured at $sha.</sub>"
fi

printf '%s\n' "$block"

[ -n "$append" ] || exit 0

body="$(gh pr view "$NUMBER" --json body --jq .body)" ||
  fail "could not read the body of #$NUMBER"

# Everything before an earlier block, so a second run replaces those images
# instead of appending a second set below them.
body="${body%%"$MARKER"*}"
while [ -n "$body" ] && [ "${body: -1}" = $'\n' ]; do
  body="${body%$'\n'}"
done

file="$(mktemp)"
trap 'rm -f "$file"' EXIT
printf '%s\n\n%s\n' "$body" "$block" > "$file"

gh pr edit "$NUMBER" --body-file "$file" || fail "could not update the body of #$NUMBER"
