---
name: pull-request
description: Write a pull request description for this repository. Use when opening a PR, updating a PR body, or when asked to describe or summarise a branch for review.
---

# Pull request descriptions

A PR description has one job: let a reviewer understand the change without
reverse-engineering the diff. Follow `.github/pull_request_template.md` and keep
the length proportional to the size and risk of the change — a one-line fix
needs a sentence, a schema migration needs the full treatment.

- Lead with **why**: the problem being solved and the motivation for solving it
  now. Link the issue if one exists, but summarise it so the PR stands alone.
- Describe **what** changed at the level of its shape and the design decisions
  behind it. Never restate the diff as a file-by-file changelog — the diff
  already shows that. If you rejected an obvious alternative, say why.
- State **how it was verified**: tests added, manual checks run. A UI change
  needs before/after screenshots, and they belong in your reply to the user, not
  in the PR body — `gh` cannot upload images, and from the reply the user can
  drag them into the description themselves. The body says in words what changed
  visually, so a reviewer reading the PR alone knows what moved; it never
  explains that images could not be attached.
- Call out only what the reviewer genuinely needs: breaking changes, migration
  or deploy ordering, deliberately deferred work, and where to start reading if
  the diff is large.
- Be concise. Delete template sections that do not apply rather than filling
  them with "N/A" or padding. Prose the reader must skim past is worse than
  absence.

Before writing, read `.github/pull_request_template.md` and the last few merged
PR bodies (`gh pr list --state merged --limit 3 --json title,body`) so the new
description matches the house style.
