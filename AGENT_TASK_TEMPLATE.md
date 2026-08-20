# Agent task brief

Copy everything below the line, fill it in, and hand it to the agent as the
task prompt. The brief describes **this task only** — the repository-wide rules
in [`AGENTS.md`](AGENTS.md), and in the per-area `AGENTS.md` file for the part
of the tree being changed, apply in full and do not need repeating here.

Keep the brief proportional to the task. A one-line fix needs a task line,
a problem sentence, and one acceptance criterion; delete every section that
does not apply rather than filling it with "N/A". The prompts in the comments
are for the author and should be deleted as the brief is filled in.

---

## Task

<!-- One line, matching the issue and commit convention:
     feat|fix|test|refactor|chore|ci|docs|build: web|server|mobile|db|infra: short imperative summary -->

`<type>: <area>: <summary>`

## Problem

<!-- What is wrong or missing today, and why it matters. Describe the current
     behaviour concretely — the screen, the package, the viewport, the failure —
     and the consequence for a user or an operator, not just the defect.
     Link the issue if one exists, but summarise it so the brief stands alone. -->

## Intended change

<!-- The shape of the solution: enough for the agent to start, without pinning
     down decisions better made while implementing. If an obvious alternative
     was already rejected, say so and why, so it is not re-litigated. -->

## Out of scope

<!-- Only if there is a nearby temptation worth naming: adjacent refactors,
     behaviours to leave untouched, files that must not change. Delete if the
     scope is obvious from the change itself. -->

## Acceptance criteria

<!-- The checklist that makes "done" unambiguous. Each item should be
     observable — something a reviewer could check without reading the diff. -->

- [ ]
- [ ]

## Verification

<!-- Only what this task needs beyond the defaults in AGENTS.md (TDD, tests
     for every behaviour, e2e coverage for cross-layer flows, lint/build
     green). Name the specific flows, locales, personas, or viewports that
     must be exercised, e.g. "e2e: finishing a workout as Alex Morgan",
     "screenshots:diff must show only the routine pages moving". -->

## Pointers

<!-- Where to start reading: relevant files, packages, or components; prior
     art elsewhere in the codebase that does the same kind of thing; related
     PRs or issues. Good pointers save the agent an exploration pass —
     but wrong ones cost more than none, so only list what you know. -->

## Definition of done

<!-- Delete items that do not apply, but the default is all of them. -->

- [ ] Acceptance criteria above are met and verified, not assumed.
- [ ] Tests, linters, and builds pass, run through `mise run`.
- [ ] User-facing strings go through vue-i18n in every supported locale.
- [ ] UI changes reviewed with `mise run screenshots:diff` — only the intended
      pages moved.
- [ ] Work is committed in self-contained conventional commits.
- [ ] PR opened following `.github/pull_request_template.md`, with
      before/after screenshots for UI changes.
