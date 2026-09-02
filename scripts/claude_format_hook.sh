#!/bin/bash
#
# Formats the one file an Edit or Write just touched, wired up as a PostToolUse
# hook in .claude/settings.json.
#
# CLAUDE.md asks for the formatters to be run before a change is considered
# complete, but prose is skippable and skipping it is silent. This runs them
# whether or not anyone remembers, and by the time the pre-push hook formats
# the tree there is nothing left for it to change.
#
# Per file rather than `mise run format`, which would reformat the whole tree
# and bury the real change in an unrelated diff. The formatters are still
# resolved through mise, so the hook uses the versions pinned in mise.toml
# rather than whatever a system install put on PATH.

set -uo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Nothing to format for a deleted file, a payload without a path, or a tool
# whose input this hook does not understand.
[[ -n "$file" && -f "$file" ]] || exit 0

# Only files this worktree owns. CLAUDE.md forbids editing another worktree or
# the main checkout, so a path from outside is a mistake to leave untouched
# rather than one to format in place.
rel=${file#"$root"/}
[[ "$rel" != "$file" ]] || exit 0

# Exit code 2 is what puts the formatter's complaint in front of Claude, so a
# file it just wrote and cannot parse gets fixed in the same turn.
run() {
  local name=$1 output
  shift

  if ! output=$(mise exec -- "$@" 2>&1); then
    printf '%s failed on %s:\n%s\n' "$name" "$rel" "$output" >&2
    exit 2
  fi
}

# The formatters .golangci.yml enables, so the file leaves here as
# 'lint:backend' expects it. Run from the root so the config is found.
case "$file" in
*.go)
  cd "$root" || exit 0
  run golangci-lint golangci-lint fmt "$rel"
  exit 0
  ;;
esac

# Only web/ has a Prettier configuration, so the rest of the tree is left alone
# rather than reformatted to Prettier's defaults.
case "$rel" in
web/*)
  case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.vue | *.css | *.scss | *.html | *.json | *.md | *.yml | *.yaml)
    cd "$root/web" || exit 0
    run Prettier ./node_modules/.bin/prettier --write "${rel#web/}"
    ;;
  esac
  ;;
esac

exit 0
