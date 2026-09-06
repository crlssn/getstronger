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

Three recurring jobs are written up as skills rather than rules, because they
matter only when you are doing them: `.claude/skills/pull-request/SKILL.md` for
writing a PR description, `.claude/skills/design-review/SKILL.md` for looking at
the app instead of reasoning about its markup, and
`.claude/skills/design-brief/SKILL.md` for briefing Claude Design when a screen
needs mocking rather than photographing.

## Working in a worktree

Several agents may work on different features at the same time, each in its own
worktree. The local stack is not shared, so set it up before running anything.

- When creating a new worktree, always fetch the latest `main` first and branch
  out from it, so the new workspace starts from up-to-date code.
- Run `mise run worktree:env` once per worktree before the first build, test, or
  server start. It assigns this worktree its own database container, database
  port, backend port, SSE port, web port, MailHog ports, end-to-end test ports,
  and Playwright report ports, and records them in `.env`, `web/.env`,
  `mise.local.toml`, and `.claude/launch.json` (rendered from the tracked
  `.claude/launch.json.example`, so the browser preview starts on this
  worktree's web port). These files are not tracked by Git. It ends by
  installing the JavaScript dependencies this worktree's lockfiles name —
  seeding `node_modules` from the main checkout first, so the install has
  almost nothing to do — leaving a fresh worktree ready to lint, test, or push
  without an `install:js` of your own.
- The slot it hands out is the lowest one no other worktree and no container
  has claimed, so it is safe to run in a worktree that already has one: a
  worktree sharing another's slot is renumbered, and one that has its own keeps
  it. If it reports that every slot is taken, containers from removed worktrees
  are holding them; `mise run worktree:prune` lists those and
  `mise run worktree:prune -- --force` removes them.
- Run every command through `mise run`, never the underlying tool directly.
  Only `mise run` loads the per-worktree ports; `npx playwright test` or
  `npm run dev` on their own fall back to the shared defaults and will collide
  with another worktree.
- Create this worktree's database with `mise run db:init`, `mise run db:migrate`,
  and `mise run db:seed` before verification.
- Never run `mise run db:clean`, `mise run db:init`, or `mise run clean` with a
  `DB_CONTAINER` you did not configure, and never stop or remove a Docker
  container, server, or port that belongs to another worktree. The tasks that
  create, wipe, or remove state refuse to run in a worktree that has not been
  given its own — they name `mise run worktree:env` when they do.
- Nothing this worktree runs is meant to outlive the work. `mise run
  worktree:clean` stops its servers and containers without deleting anything,
  and a SessionEnd hook runs it, so an ended chat leaves no backend and no
  database behind. A SessionStart hook sweeps in the background for what that
  cannot catch — a session that ended without its hook, and a pull request that
  merged on GitHub — freeing the worktrees that are gone or merged;
  `mise run worktree:sweep` is the same sweep by hand. Both stop and kill only:
  removing a container is still `mise run worktree:prune -- --force`, and the
  last few runs are logged to `.git/worktree-cleanup.log`.
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
- The pre-push hook formats, lints, and tests only the areas the push changes,
  so a web-only push never starts a database container. Let it run: `--no-verify`
  is for a hook that is broken, not for one that is slow.

## Pull requests

- Open every pull request with `mise run pr:create "<subject>" <body-file>`, and
  write the body with the `pull-request` skill. The task mints a GitHub App
  token so the app authors the pull request. GitHub refuses a self-approval, so
  one opened under your own account can never satisfy the single approval `main`
  asks for.
- Stack a pull request on another with `--base <branch>`, naming the branch
  below it. Without it the pull request targets `main` and shows the whole
  stack's diff.
- Push the branch yourself before running it. The app token only ever opens the
  pull request: commits the app authors count as unattributed changes, and the
  ruleset then wants a second approval that nobody can give.
- Turn on auto-merge as yourself, not through the task:
  `gh pr merge --auto --squash`.
- The app's ids are tracked in mise's `[env]`, so a new worktree needs no setup.
  The private key is the only credential and lives outside the repository, at
  `~/.config/getstronger/gh-app.pem`. Run the task through `mise run`; a bare
  `./scripts/pr_create.sh` has none of that in its environment.

## Writing for people

Anything a person reads — a comment, a commit message, a PR description, a reply
in chat — is as short as it can be and still land. Choose each word; cut the
ones that carry nothing. Say the thing, then stop.

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
