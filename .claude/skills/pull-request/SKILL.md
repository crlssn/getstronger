---
name: pull-request
description: Write a pull request description for this repository. Use when opening a PR, updating a PR body, or when asked to describe or summarise a branch for review.
---

# Pull request descriptions

A PR description has one job: let a reviewer understand the change without
reverse-engineering the diff. Follow `.github/pull_request_template.md` and stay
inside its budget — **250 words for the whole body, 400 as a hard ceiling**. A
body nobody reads end to end helps nobody, so the cap binds even when the change
is subtle.

## Write it in this order

1. **Draft the one-sentence lede first**, before any section: what this change
   does, above the first heading. If you cannot write it in one sentence, you do
   not yet understand the change well enough to describe it.
2. Fill the sections under their caps, below.
3. **Cut to the cap before posting.** Count the words. Whatever survives the cut
   and still matters goes in a follow-up comment on the PR, where reading it is
   opt-in — never back into the body.

## Section caps

- **Why**: at most three sentences, covering only what the linked issue does not
  already say. Link the issue; do not re-summarise it.
- **What**: at most five bullets, at the level of the change's shape and its
  design decisions. Never restate the diff as a file-by-file changelog. A
  rejected alternative gets one clause, or is dropped if it does not change how
  the diff is read.
- **Verification**: one line — commands run and tests added. Expand only for a
  failure or a flake. A UI change puts its before/after screenshots in the body
  with `mise run pr:screenshots <number> --append`, once the pull request is open
  and its number known. The review happens on GitHub, so a chat reply alone
  leaves the reviewer nothing to look at.
- **Notes for the reviewer**: at most three bullets, and only what the reviewer
  genuinely needs — breaking changes, migration or deploy ordering, deliberately
  deferred work, where to start reading a large diff. Delete the section rather
  than padding it.

Delete template sections that do not apply rather than filling them with "N/A".
Prose the reader must skim past is worse than absence.

Before writing, read `.github/pull_request_template.md` and the last few merged
PR bodies (`gh pr list --state merged --limit 3 --json title,body`) so the new
description matches the house style — but match the caps above, not the length
of older bodies written before them.
