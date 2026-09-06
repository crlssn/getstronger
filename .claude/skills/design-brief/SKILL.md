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
photographed. Follow `.claude/skills/design-review/SKILL.md`: photograph the ref
you want as the before with `mise run screenshots`, change the component, then
`mise run screenshots:diff` to see what moved. Page names are the `name:`
fields in `web/tests/screenshots/catalogue.ts` — `home`, `workout`,
`view-routine`, `quick-workout` and the rest. That loop costs a fraction of a
canvas session and ends in shipped code rather than a mock still to be ported.

A canvas earns its cost when the point is choosing between directions.

## Writing the brief

Name five things. Each one omitted is a paragraph of output paid for and a
round trip spent correcting it.

1. **Which screens, and how many.** Two or three, named. "Design the workout
   flow" returns eight artboards and cost is linear in artboards.
2. **Dimensions** — 390×844, the viewport `web/playwright.screenshots.config.ts`
   photographs at, so a mock and a screenshot are comparable.
3. **The tokens**, pasted from below. Left to invent, it emits a bespoke
   palette and long CSS blocks: more output, and a mock that maps onto nothing.
4. **Fidelity.** Greybox the alternatives, refine only the survivor. Fidelity
   is the multiplier, and refining three directions to discard two is the
   classic waste.
5. **The constraint that made this worth designing** — the thing that is wrong
   today, in one sentence.

## The tokens

From `web/src/assets/theme.css`, which is the source of truth. Paste this into
the brief rather than pointing at the file.

```
Type: system-ui. display 30/1.15/-.025em · title 22/1.25/-.02em ·
      body-lg 17/1.5 · body 15/1.5 · meta 13/1.4 · eyebrow 12/1.3/+.1em
      Nothing below 12px, ever.
Ink:  #25282d · strong #1f2226 · muted #565b61 · tint #e8e9e7 ·
      surface #f5f5f2 · border #d4d5d3
Bg:   surface #ffffff · sunken #f5f5f3 · inverse #25282d · track #e8e9e7
      border #e3e5e0 · strong #cbd5e1
Text: #16181b · muted #5b6167 · subtle #656b71
State: success #047857 on #ecfdf5 · warning #b45309 on #fffbeb ·
       danger #dc2626 (text #b91c1c) on #fef2f2 · info #334155 on #f1f5f9
Record: #ad7b1f (text #8b5f18) on #fbf4e6, border #e8d0a2 — personal records only
Controls: 48 default · 44 floor, never below · 56 submit
Radius: control 12 · card 16 · sheet 24 · pill full
Shadow: card 0 1px 2px rgb(2 6 23/.06) · raised 0 4px 12px/.08 ·
        overlay 0 16px 40px/.16
```

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
