# Project instructions

Tasks arrive as a brief describing that task alone. This file holds the
repository-wide rules that apply to every task and take precedence when a brief
is silent.

## Where the rest of the rules live

Rules that only apply to one part of the tree live beside it, and load when
that part is opened. Read the file for the area you are about to change.

| Area                     | Rules                              | Covers                                        |
| ------------------------ | ---------------------------------- | --------------------------------------------- |
| `server/` (Go backend)   | [`server/CLAUDE.md`](server/CLAUDE.md)     | Error handling, log messages, layering  |
| `web/` (React web app)   | [`web/CLAUDE.md`](web/CLAUDE.md)           | State, components, localisation, testing |
| `database/`              | [`database/CLAUDE.md`](database/CLAUDE.md) | Migrations, seeding, generated models   |
| `proto/`                 | [`proto/CLAUDE.md`](proto/CLAUDE.md)       | Schema changes and code generation      |
| `mobile/`                | [`mobile/CLAUDE.md`](mobile/CLAUDE.md)     | Capacitor wrappers and native builds    |

Two recurring jobs are written up as skills rather than rules, because they
matter only when you are doing them: `.claude/skills/pull-request/SKILL.md` for
writing a PR description, and `.claude/skills/design-review/SKILL.md` for
looking at the app instead of reasoning about its markup.

## Working in a worktree

Several agents may work on different features at the same time, each in its own
worktree. The local stack is not shared, so set it up before running anything.

- When creating a new worktree, always fetch the latest `main` first and branch
  out from it, so the new workspace starts from up-to-date code.
- Run `mise run worktree:env` once per worktree before the first build, test, or
  server start. It assigns this worktree its own database container, database
  port, backend port, SSE port, web port, MailHog ports, and end-to-end test
  ports, and records them in `.env`, `web/.env`, `mise.local.toml`, and
  `.claude/launch.json` (rendered from the tracked
  `.claude/launch.json.example`, so the browser preview starts on this
  worktree's web port). These files are not tracked by Git. It also seeds
  `node_modules` from the main checkout, so a fresh worktree needs no
  `bun install` before linting, testing, or pushing — only rerun
  `mise run install:js` if a `bun.lock` has changed since branching.
- Run every command through `mise run`, never the underlying tool directly.
  Only `mise run` loads the per-worktree ports; `npx playwright test` or
  `npm run dev` on their own fall back to the shared defaults and will collide
  with another worktree.
- Create this worktree's database with `mise run db:init`, `mise run db:migrate`,
  and `mise run db:seed` before verification.
- Never run `mise run db:clean`, `mise run db:init`, or `mise run clean` with a
  `DB_CONTAINER` you did not configure, and never stop or remove a Docker
  container, server, or port that belongs to another worktree.
- Confine all changes to this worktree. Do not edit files in another worktree or
  in the main checkout.

## Implementing and testing functionality

- Follow test-driven development: write or update a failing test first, make the
  smallest change that passes it, then refactor with the suite green. If TDD
  does not apply — documentation-only or exploratory work — say why before
  implementing.
- Add or update automated tests for every new behavior and bug fix.
- Add an end-to-end test for every feature, improvement, or fix that spans the
  UI, backend, and database (`mise run test:e2e`). It must exercise the complete
  user-visible flow across all affected layers; lower-level tests do not replace
  this requirement.
- Run the targeted tests, linters, type checks, and builds for the areas you
  touched before considering a change complete. The per-area rules name them;
  `mise run test` and `mise run lint` run everything.
- After changing backend code, restart this worktree's backend service after
  verification so the running app uses the new code.
- After changing the database schema or database-dependent behavior, add any
  missing seed data, recreate or restart this worktree's database, apply the
  migrations, and reseed it before verification.

## Git commits

- When asked to create a commit, follow the repository's existing commit history.
- Format commit subjects as `<type>: <description>`, with a lowercase
  Conventional Commit type and a concise, imperative description. Prefer an
  existing type: `feat`, `fix`, `test`, `refactor`, `chore`, `ci`, `docs`,
  `build`.
- After completing and verifying a valuable, self-contained change, commit it so
  the repository history records the progress.
- Keep unrelated changes in separate commits, and do not commit incomplete or
  unverified work.

## Pushing

- Always rebase onto the latest `main` before pushing: `git fetch origin` and
  `git rebase origin/main`. Several agents work in parallel, so `main` has
  usually moved since branching.
- Resolve conflicts locally and rerun the relevant tests, linters, and builds
  after the rebase — a clean rebase can still break behaviour when the incoming
  changes interact with yours.
- Prefer rebasing over merge commits so each branch stays a linear series of
  commits on top of `main`.

## Code comments

A comment earns its place by delivering its point in the first sentence, and
length itself is information: a long comment signals a genuinely tricky spot.

- Inline comments answer "why is this line surprising?" in one line, two at
  most. If the explanation needs a paragraph, restructure or rename instead.
- Function and method doc comments take one to four lines, with a first sentence
  that stands alone — tooling and readers often see nothing else.
- Package and file-level docs may run longer, but put the gist in the first
  paragraph.
- Reserve comments longer than five lines for subtle invariants and hairy
  algorithms. Anything else that long belongs in the README, a design doc, or
  the commit message.
