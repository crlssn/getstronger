#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NO_COLOUR='\033[0m'

echo "Running pre-push hook"

echo "Formatting code..."
make format > /dev/null
if [[ $(git status --porcelain) ]]; then
  echo -e "⚠️ ${RED}Uncommitted changes found. Aborting push.${NO_COLOUR}"
  echo "Run 'git diff' to see uncommitted changes."
  echo "Run 'git push --no-verify' to bypass this check."
  exit 1
fi

echo "Linting code..."
make lint > /dev/null || {
    echo -e "⚠️ ${RED}Linting failed. Aborting push.${NO_COLOUR}"
    echo "Run 'make lint' to see linting errors."
    echo "Run 'git push --no-verify' to bypass this check."
    exit 1
}

echo "Running tests..."
make test > /dev/null || {
    echo -e "⚠️ ${RED}Tests failed. Aborting push.${NO_COLOUR}"
    echo "Run 'make test' to see test failures."
    echo "Run 'git push --no-verify' to bypass this check."
    exit 1
}

echo -e "✅  ${GREEN}All checks passed. Pushing changes.${NO_COLOUR}"
exit 0
