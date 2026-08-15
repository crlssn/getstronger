# Project instructions

## Git commits

- When asked to create a commit, follow the repository's existing commit history.
- Format commit subjects as `<type>: <description>`.
- Use a lowercase Conventional Commit type and a concise, imperative description.
- Prefer an appropriate existing type such as `feat`, `fix`, `test`, `refactor`, `chore`, `ci`, `docs`, or `build`.
- After completing and verifying a valuable, self-contained change, commit it so the repository history records the progress.
- Keep unrelated changes in separate commits, and do not commit incomplete or unverified work.

## Implementing and testing functionality

- Follow test-driven development when implementing changes: write or update a failing test first, then make the smallest implementation change needed to pass it, and refactor while keeping the test suite green. If TDD is not applicable (for example, documentation-only or purely exploratory work), state why before implementing.
- Add or update automated tests for every new behavior and bug fix.
- Add an end-to-end test for every feature, improvement, or fix that spans the UI, backend, and database. The test must exercise the complete user-visible flow across all affected layers; lower-level tests do not replace this requirement.
- Run the relevant targeted tests, linters, type checks, and builds before considering a change complete.
- After changing backend code, restart the local backend service after verification so the running app uses the new code.
- After changing the database schema or database-dependent behavior, add any missing seed data, recreate or restart the local database, apply the migrations, and reseed it before verification.
