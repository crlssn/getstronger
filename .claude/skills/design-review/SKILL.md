---
name: design-review
description: Look at the GetStronger app instead of reasoning about its markup — capture screenshots of every page, read the accessibility and tap-target findings, and diff what a change moved visually. Use when reviewing UI or styling changes, checking mobile layout, or asked how a page actually looks.
---

# Reviewing the design

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
  `mise run screenshots:diff`. It re-photographs against the previous run, names
  the pages whose pixels changed, keeps the earlier images in
  `web/.screenshots-baseline/`, and writes a highlighted image of each difference
  to `web/screenshots/changes/`. Use it to check that a style change reached
  every page it should and no page it should not. Photograph the pages before
  changing them, or there is no before to compare with.
- Report a visual change by sharing the images, not by describing it. Attach
  each changed page before and after — the baseline image and the new one — with
  the highlighted difference, so the change is judged by looking at it.
- Put the same images in the pull request with
  `mise run pr:screenshots <number> --append`. For each page in
  `web/screenshots/changes/` it publishes the baseline image, the new one and the
  difference, and appends a before, after and difference table to the body,
  replacing an earlier block rather than adding a second one. Publish a folder of
  the set as it is with `--path web/screenshots/active`; anything outside
  `web/screenshots/` is refused.
- Add a page, or a state that is only reachable by interacting with a page, by
  adding an entry to `web/tests/screenshots/catalogue.ts`. Creating an exercise,
  a routine, a plan, or a workout is photographed as a flow in
  `web/tests/screenshots/flows.ts`, which captures each form filled in before
  submission and the result afterwards, and deletes what it created.

These tasks reseed and photograph against this worktree's database, so run them
one at a time — never in parallel with an end-to-end run or another seed.
