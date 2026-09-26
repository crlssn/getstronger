---
name: backend-coverage
description: Find which lines of the Go backend no test reaches, and which test covers a given line, with tobari. Use when closing a backend coverage gap, asked what covers some code, or looking for tests that duplicate each other.
---

# Finding backend coverage gaps

`mise run test:backend:coverage [packages]` runs the tests under
[tobari](https://github.com/goccy/tobari) instrumentation and writes two files
to `.tobari/`, which Git ignores:

- `coverage.out` is an ordinary coverprofile — `awk '$NF == 0' .tobari/coverage.out`
  lists every block no test reached, which is where a gap is.
- `tobari.json` is the same run *scoped*: one entry per test under `counts`,
  holding the blocks that test reached. It answers what a coverprofile cannot —
  which test covers a line, and which two tests cover the same thing.
  `tobari html -o coverage.html .tobari/tobari.json` renders it.

Pass a package pattern to measure part of the tree in seconds rather than the
whole backend in minutes. The first instrumented build is slow whatever the
scope — a whole-program analysis per test binary — and the ones after it are
ordinary build time.

Nothing measures this in CI: `test.server.yml` reports the plain coverprofile
to Codecov as it always has, and this is a tool for whoever is closing a gap.
