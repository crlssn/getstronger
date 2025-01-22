#!/bin/bash

# Run tests
echo "Running pre-push hook..."

echo "Formatting code..."
make format

echo "Checking for uncommitted changes"
if [[ $(git status --porcelain) ]]; then
  diff=$(git diff)
  echo "$diff"
  echo "Uncommitted changes found. Aborting push."
  exit 1
fi

echo "Linting code..."
make lint || {
    echo "Linting failed. Aborting push."
    exit 1
}

echo "Running tests..."
make test || {
    echo "Tests failed. Aborting push."
    exit 1
}

echo "All checks passed. Pushing changes..."
exit 0
