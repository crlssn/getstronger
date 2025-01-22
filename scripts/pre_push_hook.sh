#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NO_COLOUR='\033[0m'

# Run tests
echo "Running pre-push hook..."

echo "Formatting code..."
make format > /dev/null 2>&1

echo "Checking for uncommitted changes"
if [[ $(git status --porcelain) ]]; then
  echo -e "${RED}Uncommitted changes found. Aborting push.${NO_COLOUR}"
  exit 1
fi

echo "Linting code..."
make lint > /dev/null 2>&1 || {
    echo -e "${RED}Linting failed. Aborting push.${NO_COLOUR}"
    exit 1
}

echo "Running tests..."
make test > /dev/null 2>&1 || {
    echo -e "${RED}Tests failed. Aborting push.${NO_COLOUR}"
    exit 1
}

echo -e "${GREEN}All checks passed. Pushing changes...${NO_COLOUR}"
exit 0
