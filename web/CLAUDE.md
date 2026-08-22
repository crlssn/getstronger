# Web rules (`web/`)

React 19 + TypeScript + Tailwind, on Vite. `src/ui/` holds screens and
components, `src/stores/` the state, `src/router/` the route table and the
guards, `src/proto/` generated Connect clients that are never edited by hand.

Verify with `mise run test:web` (build plus unit tests) and `mise run lint:web`.
Flows that cross the UI, backend, and database also need an end-to-end test:
`mise run test:e2e`.

To see the app rather than reason about its markup — screenshots, accessibility
and tap-target measurements, visual diffs — follow
`.claude/skills/design-review/SKILL.md`.

## State

Zustand, with module-level store singletons so non-component code
(`http/interceptors.ts`, `jwt/jwt.ts`) can reach a store the same way a
component does. The conventions — selectors for derived values, `getState()`
outside components, `persist` with an explicit `partialize`, and how a spec
resets a singleton — are in [`src/stores/README.md`](src/stores/README.md).

Two rules that bite if you miss them:

- **`workout` is an Immer store, so its state is frozen.** Never assign into a
  set you read out of it. Every edit goes through
  `updateSet(routineID, exerciseID, index, changes)`, which is also the only
  thing that notifies subscribers. Passing `undefined` for a field clears it.
- **A store never wires itself up on import.** `startMutationQueue()` and
  `pollUnreadNotifications()` are called by the app, not by the module.
  Import-time wiring fires in whatever order the bundler resolves modules and
  cannot be undone in a test.

## Components

CSS Modules for anything a component styles itself, using the same
`@reference` + `@apply` authoring as the rest of the design system. A component
with nothing but utility classes writes them in the JSX and skips the module.
Callers pass `className`, which is appended via `cn()` rather than replacing the
component's own.

Only two class names are still global — `.loading-card` and `.segmented`.
Everything else is a module local and appears in the DOM hashed, so **nothing
outside a component may select by its class**: the end-to-end suite reaches
elements by role, name or id instead.

Screens that want an action in the top nav bar render `<PageNavAction>`. A
sentence with an element in the middle of it goes through `<RichMessage>`.

## Testing

Component specs render, they do not inspect. `renderWithProviders` from
`src/ui/testing.tsx` wraps a component in the router and the i18n provider,
which is the context every screen has in the real app.

`<StrictMode>` is on, so effects run twice in development. Keep them idempotent
— that is what `utils/appendPage.ts` exists for, and it is what caught a page of
results being appended twice.

Coverage is reported by `npm run test:unit -- --run --coverage` and enforced in
CI; it sits above 95% statements. `src/proto`, `src/main.tsx` and the specs are
excluded.

## Localisation

Every user-facing string must go through i18next. Never hard-code English text
in components — the only exceptions are the brand assets in `src/brand.ts` (the
product name, slogan, and signup subtitle), which read the same in every locale
and must never enter the message catalogues. `brand.spec.ts` fails if a
catalogue value contains any of them.

- Add every new string to `src/i18n/messages.ts` in **every supported locale**,
  and render it with `t()`. The test suite enforces key parity between locales,
  so a key added to one locale only will fail `messages.spec.ts`.
- This covers more than markup: aria-labels, input placeholders, confirm
  dialogs, toast messages, dropdown item titles, page-title fallbacks, and
  strings built outside JSX all count as user-facing.
- Reuse an existing key when one already says the same thing (check `common.*`
  first) instead of adding a near-duplicate.
- Placeholders are single-brace (`{count}`, `{brand}`), configured that way in
  `src/i18n/index.ts`.
- Counts use i18next's `_one`/`_other` key pairs rather than a ternary on
  `count === 1`. Both arms must exist in both locales — `messages.spec.ts`
  fails otherwise, because a single-armed plural renders that arm for every
  count, silently.
- When adding or changing translations in a non-English locale, match the
  terminology and tone already used in that locale's catalogue rather than
  translating each string in isolation.
