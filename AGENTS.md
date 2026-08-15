# Project instructions

## Working in a worktree

Several agents may work on different features at the same time, each in its own
worktree. The local stack is not shared, so set it up before running anything.

- Run `mise run worktree:env` once per worktree before the first build, test, or
  server start. It assigns this worktree its own database container, database
  port, backend port, SSE port, web port, MailHog ports, and end-to-end test
  ports, and records them in `.env`, `web/.env`, and `mise.local.toml`. These
  files are not tracked by Git.
- Run every command through `mise run`, never the underlying tool directly.
  Only `mise run` loads the per-worktree ports; `npx playwright test` or
  `npm run dev` on their own fall back to the shared defaults and will collide
  with another worktree.
- Create this worktree's database with `mise run db:init`, `mise run db:migrate`,
  and `mise run db:seed` before verification.
- Never run `mise run db:clean`, `mise run db:init`, or `mise run clean` with a
  `DB_CONTAINER` you did not configure, and never stop or remove a Docker
  container, server, or port that belongs to another worktree.
- Before adding a database migration, rebase onto the latest `main` and check
  `ls database/migrations | tail -1`. Another agent may already have claimed the
  next number.
- Confine all changes to this worktree. Do not edit files in another worktree or
  in the main checkout.

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
- After changing backend code, restart this worktree's backend service after verification so the running app uses the new code.
- After changing the database schema or database-dependent behavior, add any missing seed data, recreate or restart this worktree's database, apply the migrations, and reseed it before verification.
