# Project instructions

## Working in a worktree

Several agents may work on different features at the same time, each in its own
worktree. The local stack is not shared, so set it up before running anything.

- When creating a new worktree, always fetch the latest `main` first and branch
  out from it, so the new workspace starts from up-to-date code.
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

## Pull request descriptions

A PR description has one job: let a reviewer understand the change without
reverse-engineering the diff. Follow `.github/pull_request_template.md` and
keep the length proportional to the size and risk of the change — a one-line
fix needs a sentence, a schema migration needs the full treatment.

- Lead with **why**: the problem being solved and the motivation for solving it
  now. Link the issue if one exists, but summarise it so the PR stands alone.
- Describe **what** changed at the level of its shape and the design decisions
  behind it. Never restate the diff as a file-by-file changelog — the diff
  already shows that. If you rejected an obvious alternative, say why.
- State **how it was verified**: tests added, manual checks run. UI changes
  must include before/after screenshots.
- Call out only what the reviewer genuinely needs: breaking changes, migration
  or deploy ordering, deliberately deferred work, and where to start reading if
  the diff is large.
- Be concise. Delete template sections that do not apply rather than filling
  them with "N/A" or padding. Prose the reader must skim past is worse than
  absence.

## Reviewing the design

- To see the app rather than reason about its markup, run `mise run screenshots`.
  It reseeds the database and photographs every page at a phone-sized viewport
  for the signed-out visitor and both seeded personas.
- Start from `web/screenshots/manifest.json`. Every entry names the route, the
  component that renders it, the images that show it one screenful at a time,
  and the measurements taken on the page: horizontal overflow, tap targets under
  44 px, text under 12 px, hard-clipped text, and WCAG A/AA violations. Read the
  findings first to decide which images are worth opening.
- After changing a component, re-photograph only what it affects with
  `mise run screenshots:page <pattern>`, which matches page names and skips
  reseeding.
- To find out what a change moved rather than assuming, run
  `mise run screenshots:diff`. It re-photographs against the previous run,
  names the pages whose pixels changed, and writes a highlighted image of each
  difference to `web/screenshots/changes/`. Use it to check that a style change
  reached every page it should and no page it should not.
- Add a page, or a state that is only reachable by interacting with a page, by
  adding an entry to `web/tests/screenshots/catalogue.ts`. Creating an exercise,
  a routine, a plan, or a workout is photographed as a flow in
  `web/tests/screenshots/flows.ts`, which captures each form filled in before
  submission and the result afterwards, and deletes what it created.

## Implementing and testing functionality

- Follow test-driven development when implementing changes: write or update a failing test first, then make the smallest implementation change needed to pass it, and refactor while keeping the test suite green. If TDD is not applicable (for example, documentation-only or purely exploratory work), state why before implementing.
- Add or update automated tests for every new behavior and bug fix.
- Add an end-to-end test for every feature, improvement, or fix that spans the UI, backend, and database. The test must exercise the complete user-visible flow across all affected layers; lower-level tests do not replace this requirement.
- Run the relevant targeted tests, linters, type checks, and builds before considering a change complete.
- After changing backend code, restart this worktree's backend service after verification so the running app uses the new code.
- After changing the database schema or database-dependent behavior, add any missing seed data, recreate or restart this worktree's database, apply the migrations, and reseed it before verification.

## Localisation

Every user-facing string in the web app must go through vue-i18n. Never
hard-code English text in components — the only exceptions are the brand
assets in `web/src/brand.ts` (the product name, slogan, and signup subtitle),
which read the same in every locale and must never enter the message
catalogues. `brand.spec.ts` fails if a catalogue value contains any of them.

- Add every new string to `web/src/i18n/messages.ts` in **every supported
  locale**, and render it with `t()`. The test suite enforces key parity
  between locales, so a key added to one locale only will fail
  `messages.spec.ts`.
- This covers more than template text: aria-labels, input placeholders,
  `confirm()` dialogs, alert toasts, dropdown item titles, page-title fallbacks,
  and strings built in `<script setup>` all count as user-facing.
- Reuse an existing key when one already says the same thing (check `common.*`
  first) instead of adding a near-duplicate.
- Use vue-i18n plural pipes for counts (`'{count} set logged | {count} sets
  logged'`) rather than ternaries on `count === 1`.
- Components using `t()` need the i18n plugin in their specs: mount with
  `global: { plugins: [i18n] }` (import `i18n` from `@/i18n`).
- When adding or changing translations in a non-English locale, match the
  terminology and tone already used in that locale's catalogue rather than
  translating each string in isolation.
