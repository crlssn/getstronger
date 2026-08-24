#!/bin/bash
#
# Mints a GitHub App installation token, so a pull request can be opened as the
# app rather than as the repository owner. GitHub refuses a self-approval, so a
# pull request the owner authors can never satisfy the one-approval rule on
# main; one authored by the app can.
#
# Only the pull request creation uses this token. The branch is still pushed by
# whoever is working, which keeps the commits attributed to a real account and
# clear of the ruleset's extra approval for unattributed changes.
#
# Installation tokens expire after an hour. Mint one per pull request rather
# than caching it anywhere.

set -uo pipefail

readonly KEY_PATH="${GH_APP_PRIVATE_KEY:-$HOME/.config/getstronger/gh-app.pem}"

fail() {
  echo "gh_app_token: $1" >&2
  exit 1
}

[ -n "${GH_APP_ID:-}" ] || fail "GH_APP_ID is not set"
[ -n "${GH_APP_INSTALLATION_ID:-}" ] || fail "GH_APP_INSTALLATION_ID is not set"
[ -r "$KEY_PATH" ] || fail "cannot read the private key at $KEY_PATH"

# GitHub rejects a JWT carrying standard base64's '+', '/' or '=' padding.
base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

now=$(date +%s)
header=$(printf '{"alg":"RS256","typ":"JWT"}' | base64url)

# iat is backdated a minute because GitHub rejects a future-dated JWT outright,
# and this clock only has to be slightly fast for it to look like one.
payload=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' "$((now - 60))" "$((now + 540))" "$GH_APP_ID" | base64url)

signature=$(printf '%s' "$header.$payload" | openssl dgst -sha256 -sign "$KEY_PATH" -binary | base64url)
[ -n "$signature" ] || fail "could not sign the JWT with $KEY_PATH"

response=$(curl -sS -X POST \
  -H "Authorization: Bearer $header.$payload.$signature" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/app/installations/$GH_APP_INSTALLATION_ID/access_tokens")
[ $? -eq 0 ] || fail "the request to GitHub failed"

token=$(printf '%s' "$response" | jq -r '.token // empty')
[ -n "$token" ] || fail "GitHub returned no token: $(printf '%s' "$response" | jq -r '.message // .')"

printf '%s\n' "$token"
