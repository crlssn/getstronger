---
name: design-brief
description: Brief Claude Design for GetStronger — decide whether a canvas is the right tool at all, then write a constrained brief carrying the app's real tokens so the mock maps onto real components. Use when asked to mock up, redesign, explore alternatives for, or refine a screen, or when reaching for the design skill.
---

# Briefing a design

Claude Design's cost is almost all output tokens spent generating artboard
HTML, plus re-sending that HTML on every later turn. Both are avoidable, and
the first question is whether to open a canvas at all.

## Is a canvas the right tool?

| The change is                                        | Do this instead                  |
| ---------------------------------------------------- | -------------------------------- |
| Spacing, hierarchy, colour, copy on a screen that exists | Screenshot → edit → re-screenshot |
| One screen you already know the shape of             | Build it; photograph the result   |
| Several directions you don't want to build yet       | **Canvas**                        |
| A screen with no component to photograph             | **Canvas**                        |

Refining what already exists does not need a mock — the app can be
photographed. `.claude/skills/design-review/SKILL.md` has the
photograph-change-diff loop. It costs a fraction of a canvas session and ends
in shipped code rather than a mock still to be ported.

A canvas earns its cost when the point is choosing between directions.

## Writing the brief

Name five things. Each one omitted is a paragraph of output paid for and a
round trip spent correcting it.

1. **Which screens, and how many.** Two or three, named. "Design the workout
   flow" returns eight artboards and cost is linear in artboards.
2. **Dimensions** — 390×844, the viewport `web/playwright.screenshots.config.ts`
   photographs at, so a mock and a screenshot are comparable.
3. **The tokens**, extracted as below. Left to invent, it emits a bespoke
   palette and long CSS blocks: more output, and a mock that maps onto nothing.
4. **Fidelity.** Greybox the alternatives, refine only the survivor. Fidelity
   is the multiplier, and refining three directions to discard two is the
   classic waste.
5. **The constraint that made this worth designing** — the thing that is wrong
   today, in one sentence.

## The tokens

`web/src/assets/theme.css` is the source of truth, and a copy kept here went
stale within a fortnight of the design handover. Extract the light palette
fresh for every brief and paste the output, rather than pointing at the file:

```bash
sed -n '/^@theme static {/,/^}/p' web/src/assets/theme.css | grep -E '^\s*--' | grep -v -- '--font-sans'
```

Add one line of your own: type is `system-ui`, and nothing is set below 12px.

Three rules travel with them: no colour outside this list, gold is for personal
records and nothing else, and destructive is danger *text*, never a red fill.

Compose from the catalogue in `web/src/ui/components/README.md` — `AppButton`,
`AppCard`, `AppList`, `AppSheet`, `AppSegmented` and the rest — and name the
components in the brief. A mock built from real components is a mock that ports
in an afternoon.

## Keeping the session cheap

- **Generate the canvas in a subagent** that returns only the artifact URL. The
  artboard HTML never enters the main context, so it is not re-sent every turn
  after. This is the difference between quadratic and constant context cost, and
  it matters more than everything else here.
- **Tweak in the canvas editor, not through Claude.** Click-to-select, the
  properties panel, inline text editing and undo/redo are free. Come back for
  structural changes — a new section, a different layout — not to shrink a
  heading. Asking for "a bit more padding" pays model rates for a drag handle.
- **Start a session for the design.** A canvas opened in a context already full
  of code carries all of it forward.
- Once a direction is chosen, port it against the real components and photograph
  the result. The canvas is the argument, not the artefact.
