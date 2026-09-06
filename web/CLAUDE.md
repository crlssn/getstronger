# Web rules (`web/`)

React 19 + TypeScript + Tailwind, on Vite. `src/ui/` holds screens and
components, `src/stores/` the state, `src/router/` the route table and the
guards, `src/proto/` generated Connect clients that are never edited by hand.

Verify with `mise run test:web` (build plus unit tests) and `mise run lint:web`.
Flows that cross the UI, backend, and database also need an end-to-end test:
`mise run test:e2e`.

`lint:web` is two tools. ESLint reads one file at a time — typed, so a promise
nobody awaits is an error — and knip reads the import graph, which is the only
one of the two that can tell you a component nothing renders. Neither tolerates
a warning. A rule that is wrong for one line is disabled on that line with the
reason; a rule that is wrong for this app is turned off in `eslint.config.js`
with the reason. Both are read more often than they are written.

To see the app rather than reason about its markup — screenshots, accessibility
and tap-target measurements, visual diffs — follow
`.claude/skills/design-review/SKILL.md`.

Any change that alters what a page looks like ends with the page itself, before
and after, shared in the reply rather than only written to disk, so the change
is judged by looking at it. A set is keyed by the ref it was photographed on, so
the before is another ref's: photograph `main` once — `git switch main`,
`mise run screenshots`, `git switch -` — and it survives every run on this
branch. Then run `mise run screenshots:diff <pattern>` once the change is in
place: it leaves the new image in `web/screenshots/<ref>/`, a highlighted
difference in `web/screenshots/<ref>/changes/`, and names both sets it compared.
Attach all three images.

A change that becomes a pull request puts the same evidence in its body with
`mise run pr:screenshots <number> --append`, which publishes the images and
appends a before, after and difference table. The review happens on GitHub, so a
reply alone leaves the reviewer nothing to look at.

A page the change adds has no before, and a change with no visible effect —
refactors, state, tests, tooling — needs no screenshot at all; neither does one
whose page cannot be reached without a backend the worktree cannot start. Say so
instead of skipping silently.

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

`src/ui/` has three layers, and the layer a file lives in is the answer to "may
I reuse this?":

| Directory       | What lives there                                     | Reusable        |
| --------------- | ---------------------------------------------------- | --------------- |
| `ui/components` | The design system. Generic, catalogued, domain-free. | Anywhere        |
| `ui/shell`      | App chrome — the nav bars, the banners, the toaster. | Rendered once   |
| `ui/features`   | Domain widgets — workout cards, charts, the streak.  | Within a domain |

**Build screens out of the design system, and add to it before you need it.**
[`src/ui/components/README.md`](src/ui/components/README.md) is the catalogue:
what exists, and which component answers which need. Read it before writing a
control — the app went through a stage of fifty-three hand-written buttons and
five different search fields, and every one of them started as a screen that
did not find what it wanted.

Three rules enforce it, so none depends on remembering:

- **A screen may not render a bare `<button>`, `<input>`, `<textarea>` or
  `<select>`.** ESLint rejects them outside `ui/components`. A genuinely local
  exception disables the rule on that line with the reason written above it,
  where a reviewer reads it — there are four in the app, and each says why.
- **The arrows point one way.** `ui/components` may not import `ui/features`,
  `ui/shell`, a store, the HTTP layer or a generated type: the design system
  takes props and gives back events. `ui/features` may not import `ui/shell`.
  `PageNavAction` is the single exception and says why at the import.
- **Every component in `ui/components` is in the catalogue and has a spec.**
  `catalogue.spec.ts` fails otherwise, including for a catalogue entry whose
  component no longer exists.

So a new pattern goes into the system first: component, spec, catalogue entry,
and then the screen that wanted it. A pattern with one caller still belongs
there if it is generic; a pattern that knows what a workout is belongs in
`ui/features`.

CSS Modules for anything a component styles itself, using the same
`@reference` + `@apply` authoring as the rest of the design system. A component
with nothing but utility classes writes them in the JSX and skips the module.
Callers pass `className`, which is appended via `cn()` rather than replacing the
component's own — a screen positions a component from outside and never
restyles it from outside.

Only one class name is still global, `.loading-card`. Everything else is a
module local and appears in the DOM hashed, so **nothing outside a component may
select by its class**: the end-to-end suite reaches elements by role, name or id
instead.

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

## The end-to-end suite

`mise run test:e2e` runs `tests/e2e/` in four browser projects against a real
backend and a real database. Two things about how it is arranged are
load-bearing, and neither is visible from a spec file.

**The data is seeded once per run and put back between spec files.** Global
setup runs the seed command and then copies every table into an `e2e_snapshot`
schema. `resetSeedData`, which every spec file calls in a `beforeAll`, empties
the live tables and copies them back; global teardown drops the schema. Seeding
costs seconds — bcrypt for each persona, a couple of thousand inserts — and
copying back costs milliseconds, so a spec file stays free to delete and rewrite
whatever it likes. Anything a spec needs that the personas do not have, it still
creates itself. See `tests/e2e/seed.ts` and
`server/testing/factory/snapshot/main.go`.

**One run means one database, so `workers: 1` stays.** The suite gets faster by
being split across runners rather than across workers: CI shards it four ways,
and each shard is a runner with a Postgres, a backend and a dev server of its
own. Turning `fullyParallel` on would first need per-worker data — an account
per worker, or a database and a backend per worker — and nothing here provides
it.

## Localisation

Every user-facing string must go through i18next. Never hard-code English text
in components — the only exceptions are the brand assets in `src/brand.ts` (the
product name, slogan, and signup subtitle), which read the same in every locale
and must never enter the message catalogues. `brand.spec.ts` fails if a
catalogue value contains any of them. ESLint rejects literal text in JSX under
`src/ui/`, which catches the markup but not an aria-label or a toast built in a
variable — those are still yours to remember.

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
