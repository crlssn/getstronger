# The design system

Everything in this directory is shared, generic, and safe to use on any screen.
Nothing in it knows what a workout, a routine or an exercise is.

`ui/` has three layers, and the layer a file lives in is the answer to "may I
reuse this?":

| Directory       | What lives there                                        | Reusable        |
| --------------- | ------------------------------------------------------- | --------------- |
| `ui/components` | The design system. Generic, catalogued, domain-free.     | Anywhere        |
| `ui/shell`      | App chrome — the nav bars, the banners, the toaster.     | Rendered once   |
| `ui/features`   | Domain widgets — workout cards, charts, the streak.      | Within a domain |

`catalogue.spec.ts` fails if a component here is missing from this file, if this
file describes one that no longer exists, or if one has no spec. That is what
makes the rule in [`web/CLAUDE.md`](../../../CLAUDE.md) — a new pattern is added
to the system before the screen that needed it — enforceable rather than
aspirational.

## Choosing

| You need                       | Use                                                |
| ------------------------------ | -------------------------------------------------- |
| Anything a user taps           | `<AppButton>` — or `<AppIconButton>` for icon-only  |
| A text field                   | `<AppInput>` / `<AppTextarea>`                      |
| A field the user searches with | `<AppSearchField>`                                  |
| The next page of a list        | `<AppLoadMore>`                                     |
| A screen's title block         | `<AppPageHeader>`                                   |
| A panel around content         | `<AppCard>`, or the `card` utility inside a module  |
| Rows of things                 | `<AppList>` + `<AppListItem>` / `<AppListItemLink>` |
| Nothing to show yet            | `<AppEmptyState>`                                   |
| Waiting for the API            | `<AppSkeleton>`                                     |
| A modal decision or a picker   | `<AppSheet>` + `<SheetAction>`                      |
| One of a few choices           | `<AppSegmented>` / `<AppSegmentedNav>`              |
| A menu behind a ⋯              | `<DropdownButton>`                                  |

## Actions

### `<AppButton>`

Every tappable thing that is not an icon on its own. Four roles, not six
colours: `primary` (ink fill), `secondary` (white with an ink border), `ghost`
(text only) and `destructive` (danger text, never a red fill). `type="link"`
renders a router link with the same shape, so "go somewhere" and "do something"
look alike without a screen restyling an anchor.

`size` picks the height from the control scale: `md` (48px, the default), `sm`
(44px, the tap-target floor) or `lg` (56px, a form's submit). Buttons are
full-width by default because most of them are; `width="auto"` shrinks one to
its content.

### `<AppIconButton>`

A button whose whole label is its icon, so `label` is required and becomes the
`aria-label`. `tone` is `default`, `strong` (filled ink) or `danger`. Anything
with visible text belongs in `<AppButton>` instead.

### `<ActionButton>`

The single action a screen may put in the header beside its title, driven by
the `actionButton` store. Screens reach it through the store rather than by
rendering it.

### `<AppOptionalAction>`

One quiet affordance for every optional addition — "add a note", "add a tag".
Findable when looked for, never competing with the page's primary action.

### `<AppLoadMore>`

The button under a paginated list. It carries its own label, its own busy
state, and the one appearance a "show more" has anywhere in the app. Prefer
`<AppList onFetch>`, which scrolls the next page in without a button at all;
reach for this when a list is not an `<AppList>`.

### `<PageNavAction>`

Renders its children into the top nav bar's action slot. Nothing happens on a
screen with no nav bar above it, which is what lets a screen offer an action
without knowing which shell it was opened in.

## Input

### `<AppInput>`

The app's text field: one height from the control scale, one border, one focus
ring. `label` renders the field's own label; without it a caller must supply
`aria-label`. Pass `invalid` to mark it, and `hint` for the line underneath.

### `<AppTextarea>`

The multi-line field, matching `<AppInput>`'s border and focus treatment.
`autosize` grows it with its content instead of scrolling.

### `<AppPasswordInput>`

An `<AppInput>` that hides what is typed, with a toggle to show it. The toggle
fills the field's height rather than the glyph's, so it is a real tap target.

### `<AppSearchField>`

A magnifier and a `type="search"` input, in the single arrangement the app uses
for searching. `label` names the field once and becomes both the placeholder and
the accessible name. `size="lg"` is the home search panel, where the field is
the screen; `trailing` puts a control inside the field's border.

### `<AppListItemInput>`

A text field that fills a list row. The value is committed when the field is
left rather than on every keystroke, so a half-typed name never reaches the
caller.

## Surfaces

### `<AppCard>`

The panel: rounded, bordered, on `--color-surface`, with the card shadow. A
component that styles its own container applies the `card` utility in its CSS
module instead — same shape, one definition.

### `<AppPageHeader>`

A screen's title block: an optional eyebrow, the `h1`, an optional lead
paragraph, and an optional action on the right. Every tab root opens with one,
which is what keeps titles at the same size and the same distance from the
content below.

### `<AppSheet>` and `<SheetAction>`

One bottom sheet for every modal surface: drag handle, optional eyebrow, title,
body copy, a content region for list-style sheets, and stacked full-width
actions. `<SheetAction>`'s `tone` is the ranking rather than a colour, and it
is a prop rather than a class so a caller cannot invent a fifth one.

### `<AppSegmented>` and `<AppSegmentedNav>`

Pick one of these. `<AppSegmented>` takes `options` and reports the value that
was chosen; `<AppSegmentedNav>` is the same control where each option is its own
route. `label` is required — a row of unlabelled options says nothing to a
screen reader — and each option carries `aria-pressed`, not just a class.
`density="compact"` is for numeric labels (7D, 4W, 1Y) and nothing else.

### `<DropdownButton>`

The ⋯ menu. Items either navigate (`href`) or act (`func`); an item that acts is
styled as destructive, because every one of them today is a delete.

## Lists and states

### `<AppList>`

An unordered list that fetches its next page when the bottom scrolls into view.
`canFetch` controls whether the sentinel row exists at all.

### `<AppListItem>` and `<AppListItemLink>`

A row, and a row that is a link. `is="danger"` for a destructive row,
`is="header"` for a section label.

### `<AppEmptyState>`

Nothing to show, and what to do about it. `action` is required — not required
to exist, required to be decided. A screen with genuinely nowhere to go writes
`action="none"` in its own markup, where a reviewer sees the choice being made.

### `<AppSkeleton>`

The pulsating placeholder for anything that fetches from the API. Its
`.loading-card` class doubles as the screenshot harness's settle sentinel, so a
screen that fetches must show one rather than a spinner or a sentence.
