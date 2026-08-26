# The design system

Everything in this directory is shared, generic, and safe to use on any screen.
Nothing in it knows what a workout, a routine or an exercise is.

`ui/` has three layers, and the layer a file lives in is the answer to "may I
reuse this?":

| Directory       | What lives there                                     | Reusable        |
| --------------- | ---------------------------------------------------- | --------------- |
| `ui/components` | The design system. Generic, catalogued, domain-free. | Anywhere        |
| `ui/shell`      | App chrome — the nav bars, the banners, the toaster. | Rendered once   |
| `ui/features`   | Domain widgets — workout cards, charts, the streak.  | Within a domain |

`catalogue.spec.ts` fails if a component here is missing from this file, if this
file describes one that no longer exists, or if one has no spec. That is what
makes the rule in [`web/CLAUDE.md`](../../../CLAUDE.md) — a new pattern is added
to the system before the screen that needed it — enforceable rather than
aspirational.

## Choosing

| You need                       | Use                                                 |
| ------------------------------ | --------------------------------------------------- |
| Anything a user taps           | `<AppButton>` — or `<AppIconButton>` for icon-only  |
| A text field                   | `<AppInput>` / `<AppTextarea>`                      |
| A number or a duration         | `<AppNumberField>` / `<AppDurationInput>`           |
| A duration nudged in steps     | `<AppDurationStepper>`                              |
| On or off                      | `<AppSwitch>`                                       |
| A field the user searches with | `<AppSearchField>`                                  |
| The next page of a list        | `<AppLoadMore>`                                     |
| A screen's title block         | `<AppPageHeader>`                                   |
| A form's pinned submit         | `<AppFormFooter>`                                   |
| A value a row can unfold       | `<AppValueChip>`                                    |
| A panel around content         | `<AppCard>`, or the `card` utility inside a module  |
| Rows of things                 | `<AppList>` + `<AppListItem>` / `<AppListItemLink>` |
| A row that is one tap          | `<AppOptionRow>`                                    |
| Nothing to show yet            | `<AppEmptyState>`                                   |
| A fetch that failed            | `<AppErrorState>`                                   |
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

### `<AppFormFooter>`

A form's primary action, pinned above the tab bar instead of parked at the
bottom of the scroll where a long form hides it. It stands down while the
on-screen keyboard is up — a bar floating on the keyboard covers the field being
typed into — and leaves a spacer behind either way, so the page does not jump as
the keyboard comes and goes.

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

`variant="card"` draws the field as the panel it fills — the label inside it as
an eyebrow, the value at title size, no border of its own. For the one field a
screen is built around, like a routine's name; a form of many fields keeps the
default.

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

### `<AppNumberField>` and `<AppDurationInput>`

The two fields a set is logged with. Both keep the text being typed rather than
the number read back from it — rendering the value straight into the input eats
the keystroke halfway through "3.5", because "3." parses to 3 and is written
back as "3". `<AppNumberField>` takes an optional `unit`, drawn inside the
field's border as a label on it rather than a control in it.

Both are `type="text"` with an `inputMode`, not `type="number"`: a spinner on a
set row is a mis-tap waiting to happen, and a scroll wheel over one silently
changes what was logged.

### `<AppDurationStepper>`

A duration nudged in coarse steps, shown as `m:ss` between a − and a +. For a
rest that is read off a clock and adjusted in half-minutes rather than typed
exactly — every rest in the routine builder. `label` names the control and is
what the two buttons build their own names from, so a card holding several of
them still reads unambiguously to a screen reader.

The value is shown, not typed: a field in the middle of the control asked every
screen holding one to carry a border, a focus ring and a keyboard for an edit
nobody was making. It is a `spinbutton`, so the value is announced as it changes
and the arrow keys move it — what typing gave a keyboard, kept.

### `<AppSwitch>`

On or off, decided the moment it is tapped. `label` is required — a track and a
knob have no accessible name of their own.

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
`density="compact"` is for short labels — numeric ranges (7D, 4W, 1Y) and a
switch that has to share a row with a title. Nothing long enough to need the
room it gives up.

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

### `<AppOptionRow>`

A whole row that is one tap: an optional `leading` tile, the copy, an optional
`trailing` icon. Pass `selected` only for a row that toggles — a row that picks
and closes has no pressed state, and `aria-pressed="false"` on one says the
wrong thing. `flat` drops the border for a row inside an already-divided list.

### `<AppValueChip>`

A value on a row, and the way to the control that changes it: the rest a routine
gives an exercise reads as a pill on the row and unfolds its stepper only when
tapped. `label` is required — a duration on its own names nothing — and
`expanded` says whether what it opens is showing.

### `<AppEmptyState>`

Nothing to show, and what to do about it. `action` is required — not required
to exist, required to be decided. A screen with genuinely nowhere to go writes
`action="none"` in its own markup, where a reviewer sees the choice being made.

### `<AppErrorState>`

The counterpart to `<AppEmptyState>`, and the reason both exist: a screen that
only checks `length === 0` renders an unreachable server as an empty list,
which is the more confident of the two claims and the harder one to argue
with. `onRetry` is required for the same reason `action` is over there — a
dead end is not a state. `compact` is the one-row form, for a failure under
content that did arrive.

### `<AppSkeleton>`

The pulsating placeholder for anything that fetches from the API. Its
`.loading-card` class doubles as the screenshot harness's settle sentinel, so a
screen that fetches must show one rather than a spinner or a sentence.
