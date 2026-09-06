## Building with GetStronger

A warm-neutral, mobile-first system. The design is drawn in **ink** on a
**canvas**, with white cards carrying the content. There is no accent colour to
reach for: colour means status, and gold means a personal record.

### Wrap the app

Components call `t()` (react-i18next) and render `Link` / `NavLink`
(react-router-dom). **A component containing a link throws outside a router, and
without an i18n instance every label renders as its key.** Wrap once at the root:

```jsx
<I18nextProvider i18n={i18n}>
  <MemoryRouter>
    <App />
  </MemoryRouter>
</I18nextProvider>
```

`DesignSyncProvider` is exported and does exactly this — use it as the root when
you have no router of your own.

### Compose, never re-draw

Every control already exists. **Never render a bare `<button>`, `<input>`,
`<textarea>` or `<select>`** — that rule is lint-enforced in the app, and a
hand-drawn control is the one thing that will not match. Reach for `AppButton`
(or `AppIconButton` for icon-only), `AppInput` / `AppTextarea` /
`AppNumberField`, `AppSwitch`, `AppSegmented`, `AppSheet` + `SheetAction`,
`AppList` + `AppListRow`, `AppCard`, `AppPageHeader`, `AppEmptyState`,
`AppErrorState`, `AppSkeleton`.

`className` **positions** a component from outside — margins, grid placement. It
never restyles one: the component owns its own colour, height and radius.

### The class vocabulary

Tailwind v4, with every utility named for the **role** a value plays, never the
hue. If a name sounds like a colour, it is the wrong name.

| Family     | Use                                               | Real names                                                                                          |
| ---------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Surface    | page vs panel                                     | `bg-canvas`, `bg-surface`, `bg-surface-sunken`, `bg-surface-track`, `bg-ink`, `bg-ink-surface`      |
| Text       | the ink ramp                                      | `text-text`, `text-text-muted`, `text-text-subtle`, `text-text-inverse`                             |
| Status     | meaning only                                      | `text-danger`, `bg-danger-surface`, `bg-success-surface`, `bg-record-surface`, `bg-info-surface`    |
| Border     | hairlines                                         | `border-border`, `border-border-strong`, `border-ink-border`                                        |
| Type scale | role, not size                                    | `text-display`, `text-title`, `text-body`, `text-body-lg`, `text-meta`, `text-eyebrow`, `text-stat` |
| Radius     | `rounded-card`, `rounded-control`, `rounded-pill` |
| Elevation  | never with a border                               | `shadow-card`, `shadow-raised`                                                                      |
| Primitives | whole shapes                                      | `card` (panel), `control` (any tappable thing)                                                      |

Spacing, flex and grid are ordinary Tailwind (`gap-4`, `p-6`, `items-center`,
`grid-cols-2`). **Elevation and border never combine** — a top-level card takes
the shadow, a nested container closes its edge with a hairline instead.

### Where the truth is

`_ds/<folder>/styles.css` and its imports are the real stylesheet: every token
is a `:root` custom property (`var(--color-ink)`, `var(--radius-card)`,
`var(--size-control)`), so read it before inventing a value. Each component's
`.prompt.md` carries its props and examples — read that before using one.

### An idiomatic screen

```jsx
<div className="bg-canvas p-4">
  <AppPageHeader title="Workouts" lead="Everything you have logged." />
  <AppList>
    <AppListRow
      title="Push day A"
      meta="Fri 28 Aug · 51 min"
      trailing="7,240 kg"
      to="/workouts/1"
    />
  </AppList>
  <AppButton type="button" colour="primary">
    Start a workout
  </AppButton>
</div>
```

`AppButton` is full-width by default (`width="auto"` shrinks it) and takes four
roles — `primary`, `secondary`, `ghost`, `destructive`. Destructive is danger
text, never a red fill.
