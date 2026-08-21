# Vue → React migration (issue #1100)

`web-next/` is the React app under construction. `web/` is the live Vue app and
stays untouched and shipping until the swap in phase H. Nothing in `web/` should
be edited for this migration.

This file is the handover between sessions. **Read it first, update it last.**
The "Where we are" section is the source of truth for what to pick up next.

## Where we are

The React toolchain builds, typechecks, lints, formats and tests. Everything
below the UI is ported: the framework-agnostic modules, i18n on i18next, the
whole HTTP layer, all 21 stores, and the routing rules. Phase D — the
design-system primitives — is also done now. 478 tests green, 94% statement /
97% line coverage.

The only thing left below the UI is the React Router element tree itself, which
cannot be written until there are screens to point it at (phase E).

| Phase | What it covers                                         | State |
| ----- | ------------------------------------------------------ | ----- |
| A     | Toolchain scaffold + framework-agnostic leaves         | done  |
| B     | i18n, state, routing rules                             | done  |
| C     | HTTP layer                                             | done  |
| D     | Design-system primitives (`AppButton`, `AppCard`, …)   | done  |
| E     | Shell (`App`, dashboard, nav, banners, dialogs)        | next  |
| F     | Feature views (auth, workouts, exercises, routines, …) | todo  |
| G     | e2e + screenshot harness pointed at the React app      | todo  |
| H     | Swap `web-next/` into `web/`, delete the Vue app       | todo  |

Ported verbatim, no edits: `brand.ts`, `posthog.ts`, `router/tabs.ts`,
`types/*.ts`, `utils/{blurActiveElement,maskEmail,activityBuckets,distanceUnits,weightUnits}.ts`,
`http/native.ts`, `src/proto/**`, and their specs.

Ported with edits: `i18n/index.ts` (rewritten on i18next), `i18n/messages.ts`
(plurals converted, see below), `utils/{numbers,exerciseMeasurements}.ts`
(`i18n.global.t` → `i18n.t`, nothing else), `utils/datetime.ts` (same, plus a
bug fix — see "Bugs found on the way"), and `router/tabs.ts` (one guard added,
same section).

All 21 stores are on Zustand. The conventions they follow are in
`src/stores/README.md`.

The HTTP layer is done: `clients`, `interceptors`, `offlineCache`, `requests`,
`unauthenticated`, `native`, and `jwt`. `requests.ts` needed four edits across
663 lines — the router import, two `getState()` calls, and `i18n.global.t`.
`router/navigation.ts` came before the router itself; see the routing decision
below.

The nine design-system primitives are done, in `src/ui/components/`:
`AppButton`, `AppCard`, `AppEmptyState`, `AppTextarea`, `DropdownButton`,
`AppList`, `AppListItem`, `AppListItemInput`, `AppListItemLink`, `AppSheet`,
`AppSkeleton`. Each has a Testing Library spec. None import each other yet —
that starts in phase E, when screens compose them.

`useInfiniteScroll` (`src/utils/`) replaces `v-infinite-scroll`: a small
IntersectionObserver hook, its own spec, used by `AppList`'s fetch-more
sentinel. `usePagination` from `web/src/utils/` is still unported — it is the
page-token half of the same story, needed by phase F screens, not by `AppList`
itself.

Both filesystem guards are ported into `web-next/tests/`, scoped to `.tsx`
(and `.css` for the palette one) instead of `.vue`. The copy guard is rebuilt
on the TypeScript compiler API rather than regex — see the decision below for
why. Both run today with nothing to report; keep them green as phase E and F
add files.

Verify with, from `web-next/`:

```
npm run lint && npm run type-check && npm run build-only
npm run test:unit -- --run --coverage
```

## Keeping up with `web/`

`web/` keeps shipping while this is built, so every rebase can bring changes to
files already ported. Check for it after each `git rebase origin/main`:

```
git diff <last-synced-main>..origin/main -- web/src
```

Ignore the `.vue` files — those are phases E–F. The ones that matter are
`src/proto/**`, `src/http/**`, `src/stores/**`, `src/utils/**` and
`src/i18n/messages.ts`.

How each syncs:

- **`src/proto/**`** — generated, so copy over: `cp -r web/src/proto/. web-next/src/proto/`.
- **`src/i18n/messages.ts`** — copy the file, then re-run the plural conversion
  on it, rather than hand-merging. It is idempotent in the sense that matters:
  it converts the pipe form and leaves everything else alone.
- **`src/utils/**`, new modules** — usually verbatim.
- **`src/http/**`, `src/stores/**`** — apply the diff by hand, translating
  `useXStore()` to `useXStore.getState()` and `i18n.global.t` to `i18n.t`.

PR #1117 was the first of these: two new user requests, an `autofillSets`
preference, a regenerated `user_service_pb`, a new `utils/names.ts`, and a
reworked signup catalogue. The dispatch table's completeness check caught the
two new requests on its own, which is the main reason it exists.

The second sync (through `affbe0d`) was smaller: two `workout.*` catalogue
keys (`rest`, `sessionProgress`) were dropped in `web/` alongside a rest-timer
banner fix that touches only `.vue` files, so the sync was just deleting the
same two keys from both locales here. Nothing else in the tracked paths
changed.

Record the main commit you synced from when you do it, so the next diff has a
starting point: **last synced `affbe0d`**.

## Decisions already made, and why

**React 19.2.8, Vite 8, Tailwind v4** — Vite and Tailwind versions match `web/`
exactly, so the design tokens moved across untouched.

**TypeScript stays on 6.0.3, not 7.0.2.** The issue asks for the latest
TypeScript. TypeScript 7 is the native Go port, and its main entry exports only
`{ version, versionMajorMinor }` — the classic compiler API is gone:

```
$ node -e "console.log(Object.keys(require('typescript')))"
[ 'version', 'versionMajorMinor' ]
```

`typescript-eslint` (peer `>=4.8.4 <6.1.0`, no TS 7 support on `latest` or
`canary`) and `prettier-plugin-organize-imports` both consume that API, so TS 7
costs the entire type-aware lint and import-organising setup. 6.0.3 is the
latest release that keeps them, and it is what `web/` already pins — so this is
parity, not a regression. Revisit when typescript-eslint ships TS 7 support;
that is the only thing blocking the bump.

**State: Zustand + Immer, not Pinia-shaped Context.** `stores/workout.ts` is a
deep nested map mutated by path (`workouts[routineID].exerciseSets[exerciseID]`),
which is painful in plain `useState` and natural in Zustand's Immer middleware.
Zustand also gives module-level store singletons, matching how the Pinia stores
are imported directly by non-component code (`http/interceptors.ts`,
`jwt/jwt.ts`) — a Context-based design would force those modules into hooks.

The conventions that follow from it — selectors for derived values, `getState()`
outside components, `persist` with an explicit `partialize`, and how specs reset
a singleton store — are written up in `src/stores/README.md`.

Two of the Pinia stores wired themselves up as a side effect of being imported:
`mutationQueue` registered a reconnect callback, and `notifications` added a
`visibilitychange` listener. Both now happen in an exported start function the
app calls — `startMutationQueue()` and `pollUnreadNotifications()`. Import-time
wiring fires in whatever order the bundler resolves modules, cannot be undone,
and in the notifications case outlived the stop call and ran for signed-out
visitors. `connection` and `appVersion` already had `start()`/`stop()`, so this
is the convention the other stores now follow rather than a new one.

**`workout` uses Immer, and that changes how the screens write to it.** The Vue
screens read a set out of `getSets()` and assigned straight into it —
`set.weight = …`, `v-model="set.durationSeconds"`. Immer freezes the state, so
that throws. Every edit goes through `updateSet(routineID, exerciseID, index,
changes)` instead, which is also the only way a change notifies subscribers;
the Vue version relied on the returned object being reactive. Passing
`undefined` for a field clears it, so a cleared input does not keep the number
that was there before. **Phase F needs this** — it is the one place where a
component cannot be a mechanical port.

**Server-cache stores stay stores.** `activity`, `progress`, `streak`,
`dashboard` and `plans` cache request results, and a query library would model
that better in the abstract. They are ported as Zustand stores anyway: they hold
_derived_ views (a streak count, a last-performed index) rather than raw
responses, they are reset by events elsewhere in the app such as saving a
workout, and swapping in TanStack Query would change fetching behaviour in a
migration whose acceptance criterion is parity. Revisit it as its own change,
with the e2e suite green on both sides.

**i18n: i18next + react-i18next — done.** The catalogue keeps its single-brace
placeholders (`{count}`, `{brand}`, 104 of them) by configuring
`interpolation: { prefix: '{', suffix: '}' }`, so none of them needed touching.

The one catalogue edit was plurals: 16 keys per locale written in vue-i18n's pipe
form (`'{count} set | {count} sets'`) became i18next `_one`/`_other` pairs. The
old `messages.spec.ts` guarded these by comparing arm counts across locales,
which no longer means anything now that arms are separate keys, so it is replaced
by two guards that carry the same intent: every plural key has both arms in both
locales, and no pipe form survives anywhere. A single-armed plural key would
otherwise render that arm for every count, silently.

`@/i18n` exports the same surface as before (`appLocale`, `dateLocale`,
`resolveLocale`, `AppLocale`, `i18n`), so
`utils/{numbers,datetime,exerciseMeasurements}.ts` came across with one
mechanical change each — `i18n.global.t(…)` → `i18n.t(…)`.

`i18n` needs its explicit `I18nInstance` annotation: without it `tsc` fails with
TS2883, since the inferred type cannot be named portably.

**Routing: react-router-dom 7, with the rules kept out of the element tree.**
`router/routes.ts` is the whole table as data — 30 routes with their access
rule, title key and whether they hide the chrome — and `router/guards.ts` turns
those into decisions: `redirectFor(access, signedIn)`, `onNavigate` for the tab
and action-button resets, `applyPageTitle` for the header.

Keeping them separate is what let the routing land before any screen exists,
and it is also what makes it testable: `routes.spec.ts` checks that every title
key resolves in the catalogue, that every tab root is a route with a title, that
the catch-all is last, and that nothing but the auth screens is reachable signed
out. None of that needs a rendered route.

What remains is `router.tsx`: turn the table into `createBrowserRouter` routes
with a lazy element each, wrap them in something that calls `redirectForRoute`,
and call `onNavigate`/`applyPageTitle` from a navigation effect. It is short,
and it needs screens.

**The HTTP layer redirects through `router/navigation.ts`, not the router.**
`http/unauthenticated.ts` has to send an expired session back to the login
screen. In `web/` it imports the router object to do it, which closes a cycle —
the routes lazily import the views, and the views call the HTTP layer. Vue only
survives it because the view imports are dynamic.

Rather than reproduce that, the app registers the router's `navigate` via
`setNavigator` at mount, and the HTTP layer depends on the small `navigation`
module instead of on the route table. This is what lets the whole HTTP layer be
built before a single route component exists, which is the ordering the rest of
phase C needs. `goTo` falls back to a document load when nothing is registered
yet, so a redirect from a request that beat the router to mount is not lost.

Whatever creates the router must call `setNavigator(router.navigate)`. Nothing
does yet, because no router exists — that is the first line of the routing work.

**ESLint without `eslint-plugin-react`.** Its recommended set targets prop-types
and the pre-17 JSX runtime, both already covered here, and it has no ESLint 10
peer support — including it would force `legacy-peer-deps` on the whole install.
`eslint-plugin-react-hooks` is the set that catches real bugs and does support
ESLint 10.

**Components take Tailwind utility classes directly in `className`, not a
scoped `<style>` block.** Vue SFCs get per-file scoped CSS for free; React has
no equivalent, and reaching for CSS Modules or styled-components here would be
a second styling mechanism next to the utility classes the rest of the app
already uses. Where a Vue component's `@apply` block combined a shared
element-selector rule with a class-selector override on the same property
(`AppButton`'s `border-transparent` vs. each colour's `border-*`, `AppListItem`'s
`.danger`/`.header` text colour), copying both classes onto one React element
would leave Tailwind's own rule-emission order to pick a winner instead of the
original CSS specificity. Each of those spots is written out as one
non-overlapping class list per variant instead — see `AppButton.tsx` and
`AppListItem.tsx` for the pattern. Check any new `@apply` block for the same
shape before porting it the fast way.

**`AppButton` gained an explicit `disabled` prop, and a `className` one in
place of the Vue version's dead `containerClass`.** Vue attrs fall through
onto the root element automatically, which is how `class="auth-submit"` reaches
the `<button>` today even though `containerClass` is declared and never read.
React has no fallthrough, so both are real props here: `className` is what
callers now use for that, and `disabled` is new — nothing calls it yet, but a
`type="submit"` button disabled while its form saves is an obvious phase-F
need, and there is no fallthrough to add it later for free.

**`AppSheet`'s action buttons take a class from `sheetActionClass`
(`src/ui/components/sheetActionClass.ts`), not a bare `class="primary"`.** The
Vue version styles `.sheet-actions > button` and its `.primary`/`.danger`/
`.danger-outline`/`.tertiary` modifiers in an unscoped block, so any button a
caller slots into `actions` picks up the ranking just by being there. React
has no unscoped-slot styling, so callers `import { sheetActionClass } from
'@/ui/components/sheetActionClass'` and put `className={sheetActionClass.primary}`
(etc.) on their own button. It is a separate module rather than an export from
`AppSheet.tsx` because a component file exporting a second value breaks Fast
Refresh (`react-refresh/only-export-components`) — the lint rule that would
have waved this through.

**`AppList`'s fetch-more sentinel uses a real `IntersectionObserver`
(`useInfiniteScroll`), not a port of `v-infinite-scroll`.** That directive has
no React equivalent, and its actual behaviour when bound straight to a
non-scrolling sentinel element (as `AppList.vue` does) doesn't have a single
well-defined meaning to port faithfully. An intersection observer watching the
same sentinel is the standard tool for this exact UI and produces the same
result the design wants: the spinner fires `onFetch` once when it scrolls into
view. Only one caller exists in `web/` today (`ListNotifications.vue`,
phase F) and it doesn't have its own test, so there is nothing to compare
behaviour against beyond that.

**The copy guard (`tests/no-hardcoded-strings.spec.ts`) walks the TypeScript
AST instead of pattern-matching source text.** Vue's version works because
`<template>` blocks are cleanly delimited and can't contain arbitrary
TypeScript — a `/>([^<]+)</` scan over just that region is safe. JSX has no
such boundary: it's embedded in ordinary `.tsx` source that also has generics
(`Record<'a', string>`), comparisons, and template literals reusing the same
`<`/`>`/`{`/`}` characters. An early draft scanning raw text with those
regexes produced both false positives (a generic's `>` pairing with an
unrelated `<` many lines later) and false negatives (multi-line JSX text
broken across `>`/`<` boundaries needs the same-line restriction that
introduces). `ts.createSourceFile` plus `ts.forEachChild` sidesteps the whole
problem by asking the real parser which nodes are `JsxText` and which
attributes are static `StringLiteral` initializers — see the file for the
~15-line walk. It runs today with nothing to report, same as
`no-raw-palettes.spec.ts` (which stayed regex-based, since CSS/class-string
scanning has no equivalent ambiguity).

**Testing Library needs cleanup wired up by hand, and a `ResizeObserver`
stub.** `vitest.setup.ts` now calls `afterEach(() => cleanup())` — Testing
Library's own auto-cleanup only registers when it finds a global `afterEach`,
which needs `test.globals: true` in `vitest.config.ts`, and this project
doesn't set that (store specs reset singletons by hand instead; see
`src/stores/README.md`). Without it, a component mounted in one test is still
in the DOM for the next, which surfaces as spurious "found multiple elements"
failures the moment a second spec in the same file renders the same thing.
Separately, jsdom has no `ResizeObserver`, which Headless UI's floating-element
positioning (`DropdownButton`'s menu) reaches for unconditionally; a no-op
stub is registered the same way. Both are one-time setup — no future spec
needs to know either exists.

**`vitest.setup.ts` is now in `tsconfig.app.json`'s `include`.** It wasn't
before, so the `@testing-library/jest-dom/vitest` side-effect import it does
for the jest-dom matcher types (`toBeInTheDocument`, `toHaveClass`, …) was
invisible to `tsc` — the matchers worked at runtime but every use failed
`npm run type-check` with "property does not exist on type Assertion". Adding
the file to the program's include list is what makes the global augmentation
apply; `tsconfig.vitest.json`'s existing `"@testing-library/jest-dom"` entry
in `types` augments Jest's matcher interface, not Vitest's, and doesn't do
this on its own.

## Debt found in `web/` — do not carry it across

- `ts-proto@2.12.0` in `web/package.json` is unused. `buf.gen.yaml` generates
  through `protoc-gen-es`, and `@bufbuild/protoc-gen-es` lives in the root
  `package.json`. Dropped.
- `autoprefixer@10.5.4` is unused — `postcss.config.js` loads only
  `@tailwindcss/postcss`. Dropped.
- `web/eslint.config.js` scopes the Vitest rules to `src/**/__tests__/*`, a
  directory that does not exist; specs sit beside their sources, so those rules
  have never run. Fixed here (`**/*.spec.{ts,tsx}`), which immediately caught
  real `vitest/valid-expect` findings — resolved by allowing the two-argument
  `expect(value, message)` form the specs legitimately use.

## Bugs found on the way

Porting a module means writing a test for it, and two of those tests failed
against faithfully-copied code. Both fixes are in `web-next/` only; `web/` still
has them.

**`utils/datetime.ts` showed "in 0 seconds".** The relative formatter special-
cased Luxon's zero-elapsed rendering by matching the literal strings
`'0 seconds ago'` and `'för 0 sekunder sedan'`. Luxon only produces those when
the moment is in the past by under a second; a moment that is exactly now, or
slightly _ahead_ of the client clock, renders as `'in 0 seconds'` /
`'om 0 sekunder'`, which the guard missed. Server timestamps land ahead of the
client clock routinely, so this was reachable — finishing a workout and reading
"in 0 seconds". The fix drops the string matching, which was the fragile part,
and thresholds on elapsed time instead.

**`router/tabs.ts` sent two tab roots to the wrong place.** `tabRootFor` maps a
first path segment to its owning tab, and the segments are collection names
(`workouts`, `notifications`). Two tab roots are not spelled like the collection
that leads to them — `/workout` and `/profile` — so passing either returned
`/home` rather than itself. Only pushed screens are passed to it today, so
nothing was visibly broken, but it is a trap for the next caller. `tabRootFor`
now answers a tab root with itself.

## Gotchas

- **`npm install` crashes on npm 10.9.7** with `Cannot read properties of null
(reading 'edgesOut')` while resolving vitest 4's optional peer graph. It is an
  arborist bug, not a dependency conflict: `npx npm@12 install` succeeds. The
  committed lockfile is `lockfileVersion: 3` and `npm ci` works on npm 10, so CI
  is unaffected — this only bites when adding dependencies locally.
- `mise` is not installed in the Claude Code web sandbox, and neither is a
  database, so `mise run test:web` / `test:e2e` / `screenshots` cannot run there.
  Use the `npm run …` scripts inside `web-next/` directly; they are the same
  commands `mise run test:web` wraps. E2E and screenshots need a real worktree.
- `web-next/` is deliberately not wired into `mise.toml`, the deploy job, or
  `mobile/capacitor.config.ts` (`webDir: '../web/dist'`). Phase H does that by
  moving the directory into place, so no config has to learn a temporary name.
  The one exception is `.github/workflows/test.web-next.yml`, which mirrors
  `test web` so each increment is checked; delete it during the swap.
- The Vue app mounts into `<body id="app">`. React mounts into a `#root` div, so
  `index.html` differs here; `base.css` still styles `#app`, which stays as the
  body id. Check this when porting the shell.
- **`clients → interceptors → jwt → requests → clients` is an import cycle**,
  inherited from `web/` and not worth unpicking for its own sake — it resolves
  correctly at runtime. It does bite in tests: after `vi.resetModules()`,
  destructuring `import('./interceptors')` before the graph has finished
  evaluating yields `undefined` bindings. Import `./clients` first, as
  `clients.spec.ts` does. This is the same class of problem the navigation
  module was introduced to avoid, and the reason not to add the router to the
  cycle as well.

## What to do next

Phase E: the shell. `web/src/App.vue` renders `AppDashboard` when signed in,
`GuestView` otherwise, plus `AppOfflineBanner`, `AppUpdateBanner`, and
`AppConfirmDialog` — the five components `web-next/src/App.tsx`'s TODO names.
Port them in roughly this order, since each is a dependency of the next:

1. **`AppAlert`, `AppOfflineBanner`, `AppUpdateBanner`, `AppConfirmDialog`** —
   each reads one already-ported store (`alerts`, `connection`+`mutationQueue`,
   `appVersion`, `confirmation`) and heroicons; `AppAlert` is used by both
   `AppDashboard` and `GuestView` below, and `AppConfirmDialog` composes
   `AppSheet`, which is why all four come after the phase D work rather than
   before it.
2. **`AppNavBottom`, `AppNavTop`, `AppRestTimerBanner`, `AppOptionalAction`** —
   the dashboard's own chrome. `AppNavBottom` imports `useActiveWorkout` from
   `web/src/utils/`, which is not ported yet; port it alongside (it's a small
   store-derived hook, not a component).
3. **`AppDashboard`** (wraps `RouterView`/`Outlet`, the two nav bars, the rest
   banner) and **`GuestView`** (wraps `RouterView`/`Outlet`, the auth screens'
   shared chrome) — these are what `router.tsx` needs to exist first, since
   `RouterView`/`Outlet` are the concrete reason routes need real elements now.
4. **`router.tsx`**: turn `router/routes.ts`'s table into `createBrowserRouter`
   routes with a lazy element each (phase F provides those elements — until
   they exist, a route can point at a placeholder), wrapped in something that
   calls `redirectForRoute`, and call `onNavigate`/`applyPageTitle` from a
   navigation effect. `router/routes.spec.ts` and `router/guards.spec.ts`
   already cover the table and the decisions; nothing here needs new lower-
   level tests, only wiring.
5. **`main.tsx`**: port `web/src/main.ts` — auth-store init, token refresh,
   PostHog identify, route warming, and the two start calls that used to be
   import side effects (`startMutationQueue()`, and `pollUnreadNotifications()`
   for a signed-in user). Whatever creates the router must call
   `setNavigator(router.navigate)` here, or every redirect from the HTTP layer
   becomes a full page load instead of a client-side one.

`App.tsx`'s own `.statusbar-scrim` style is still unstyled — it was scoped CSS
on `web/src/App.vue` itself, not in a shared asset file, so it didn't come
across with the phase A scaffold. Port that rule (as a `className` per the
phase D pattern, or into `assets/main.css` if it reads better global) when
`App.tsx` stops being a placeholder.

Then phase F (the feature screens), which is the bulk of the remaining work by
volume, followed by phase G (e2e + screenshots) and phase H (the swap).
Nothing below the UI should need revisiting.

## Phase H — do not forget

**Persisted state changes shape at the swap.** `pinia-plugin-persistedstate`
writes the bare state under the store id; Zustand's `persist` wraps it as
`{ state, version }` under `name`. Both use the same key (`auth`,
`preferences`), so on deploy the React app will read the Vue app's value, fail
to find `state`, and fall back to defaults. For `preferences` that is a cosmetic
reset. For `auth` it signs everyone out, because `main.ts` only attempts a token
refresh when the store already looks authorised.

Fix it with a `migrate`/`merge` on the `persist` options that recognises the old
flat shape, or by seeding the store from the old key on first run. Either way it
needs to ship _with_ the swap, not after.

## Test coverage

The issue asks for 80%+. `npm run test:unit -- --run --coverage` reports it, and
CI runs it that way so the number moves with each increment rather than being
discovered at the end. It currently sits at 94% statements / 97% lines, after
phase D's components — coverage held rather than fell, since each primitive's
spec exercises close to the whole file.

Expect it to fall once phase E's stateful shell components land — `AppAlert`'s
route-watching auto-dismiss and `AppOfflineBanner`'s reconnect flow have more
branches than a presentational primitive does. `src/proto`, `src/main.tsx` and
the specs are excluded in `vitest.config.ts`; nothing else is.

`requests.ts` is worth a note, since it is a fifth of the source. Its fifty
wrappers are covered by a dispatch table in `requests.dispatch.spec.ts` that
pins each request to the client method it must reach, plus a check that the
table has an entry for every export. That is aimed at the mistake the file
invites — a new request still calling the neighbour it was copied from — rather
than at the coverage number, which it happens to raise from 32% to 99%. The
shared `tryCatch` every request routes its failures through has its own suite in
`requests.spec.ts`.

Of the 38 specs in `web/src`, 22 test plain modules and ported with little
change. Of the 16 that mount `.vue` SFCs and need rewriting against Testing
Library, `AppSheet.spec.ts` and `AppSkeleton.spec.ts` are done (phase D); the
other 14 belong to phase E/F components. The two filesystem guards in
`web/tests/` are ported into `web-next/tests/` — see the phase D decisions
above for why the copy guard isn't a straight regex port like the palette one.
