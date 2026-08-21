# Vue → React migration (issue #1100)

`web-next/` is the React app under construction. `web/` is the live Vue app and
stays untouched and shipping until the swap in phase H. Nothing in `web/` should
be edited for this migration.

This file is the handover between sessions. **Read it first, update it last.**
The "Where we are" section is the source of truth for what to pick up next.

## Where we are

The React toolchain builds, typechecks, lints, formats and tests. Everything
below the UI is ported: the framework-agnostic modules, i18n on i18next, the
whole HTTP layer, all 21 stores, and the routing rules. Phase D is under way:
the two source guards and seven of the design-system primitives. 489 tests
green, 94% statement / 97% line coverage.

The only thing left below the UI is the React Router element tree itself, which
cannot be written until there are screens to point it at.

| Phase | What it covers                                         | State       |
| ----- | ------------------------------------------------------ | ----------- |
| A     | Toolchain scaffold + framework-agnostic leaves         | done        |
| B     | i18n, state, routing rules                             | done        |
| C     | HTTP layer                                             | done        |
| D     | Design-system primitives (`AppButton`, `AppCard`, …)   | in progress |
| E     | Shell (`App`, dashboard, nav, banners, dialogs)        | todo        |
| F     | Feature views (auth, workouts, exercises, routines, …) | todo        |
| G     | e2e + screenshot harness pointed at the React app      | todo        |
| H     | Swap `web-next/` into `web/`, delete the Vue app       | todo        |

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

Ignore the `.vue` files — those are phases D–F. The ones that matter are
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
two new requests on its own, which is the main reason it exists. #1116 then
retired one catalogue key.

Record the main commit you synced from when you do it, so the next diff has a
starting point: **last synced `8d9519f`**.

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

**Components: CSS Modules where the Vue file had `<style scoped>`.** It is the
closest thing React has to scoped styles, and it keeps the `@reference` +
`@apply` authoring the design system already uses, so a component's CSS moves
across nearly unchanged. Vue's `:deep(svg)` has no equivalent and needs none —
CSS Modules hash class names, not element selectors, so `.emptyIcon svg` already
reaches through.

A component with nothing but utility classes (`AppCard`, `AppTextarea`) writes
them in the JSX and skips the module. Callers pass `className`, which is
appended via `cn()` rather than replacing the component's own — several screens
position an `AppButton` with `class="auth-submit"`.

**Component specs render, they do not inspect.** `renderWithProviders` in
`src/ui/testing.tsx` wraps a component in the router and the i18n provider,
which is the context every screen has in the real app. `vitest.setup.ts` calls
Testing Library's `cleanup` after each test: it only unmounts by itself when
Vitest's globals are on, and they are not, so without it every render in a file
stacks up in the same document.

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

Finish phase D. Done so far: the two source guards, `AppButton`, `AppCard`,
`AppSkeleton`, `AppTextarea`, `AppListItem`, `AppListItemLink`, `AppEmptyState`,
and the `renderWithProviders` helper.

Still to port from `web/src/ui/components/`:

- **`AppList`** — the one with a real decision in it. It uses `vInfiniteScroll`
  from `@vueuse/components`, which has no React equivalent here, so it needs an
  intersection-observer hook. `web/src/utils/usePagination.ts` is the other half
  of that story and is not ported either; do the two together.
- **`AppSheet`** (136 lines) and **`DropdownButton`** (70) — both are
  `@headlessui/vue` and port onto `@headlessui/react`, which is already a
  dependency. `AppSheet` has a spec in `web/` worth carrying over.
- **`AppListItemInput`**, **`AppAlert`**, **`AppConfirmDialog`**,
  **`AppOfflineBanner`**, **`AppUpdateBanner`**, **`AppOptionalAction`**,
  **`AppSkeleton`**'s siblings — several have specs in `web/`.

Then phase E (the shell) and phase F (the screens), and with them `router.tsx`
and `main.tsx` — both still placeholders. `main.tsx` should port
`web/src/main.ts`: auth-store init, token refresh, PostHog identify, route
warming, and the two start calls that used to be import side effects
(`startMutationQueue()`, and `pollUnreadNotifications()` for a signed-in user).
Whatever creates the router must also call `setNavigator(router.navigate)`, or
every redirect from the HTTP layer becomes a full page load.

After that the UI is all that is left — phases D through H, and the bulk of the
work by volume. Nothing below the UI should need revisiting.

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
discovered at the end. It currently sits at 93% statements / 95% lines.

Expect it to fall once components land — the ported modules are unusually easy
to cover. `src/proto`, `src/main.tsx` and the specs are excluded in
`vitest.config.ts`; nothing else is.

`requests.ts` is worth a note, since it is a fifth of the source. Its fifty
wrappers are covered by a dispatch table in `requests.dispatch.spec.ts` that
pins each request to the client method it must reach, plus a check that the
table has an entry for every export. That is aimed at the mistake the file
invites — a new request still calling the neighbour it was copied from — rather
than at the coverage number, which it happens to raise from 32% to 99%. The
shared `tryCatch` every request routes its failures through has its own suite in
`requests.spec.ts`.

Of the 38 specs in `web/src`, 22 test plain modules and port with little change;
the 16 that mount `.vue` SFCs need rewriting against Testing Library. Two
filesystem guards in `web/tests/` (`no-hardcoded-strings.spec.ts`,
`no-raw-palettes.spec.ts`) are regex scanners — port them in phase D and change
the extension globs from `.vue` to `.tsx`.
