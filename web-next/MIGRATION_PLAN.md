# Vue → React migration (issue #1100)

`web-next/` is the React app under construction. `web/` is the live Vue app and
stays untouched and shipping until the swap in phase H. Nothing in `web/` should
be edited for this migration.

This file is the handover between sessions. **Read it first, update it last.**
The "Where we are" section is the source of truth for what to pick up next.

## Where we are

Phase A is done and phase B is most of the way through: the React toolchain
builds, typechecks, lints, formats and tests; every module that never depended
on Vue is ported; i18n runs on i18next; and eight of the 21 stores are on
Zustand. 160 tests green, 88% statement / 90% line coverage.

| Phase | What it covers                                         | State       |
| ----- | ------------------------------------------------------ | ----------- |
| A     | Toolchain scaffold + framework-agnostic leaves         | done        |
| B     | i18n, state, routing foundations                       | in progress |
| C     | HTTP layer and the modules that depend on stores       | todo        |
| D     | Design-system primitives (`AppButton`, `AppCard`, …)   | todo        |
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

Stores on Zustand: `auth`, `connection`, `alerts`, `confirmation`, `pageTitle`,
`navTabs`, `actionButton`, `preferences`, `appVersion`, `emailVerification`. The
conventions they establish are in `src/stores/README.md` — read that before
adding the eleventh.

Not yet ported, all of them blocked on `http/requests.ts`: `activity`,
`dashboard`, `mutationQueue`, `notifications`, `plans`, `progress`, `streak`,
`workout`.

Also ported: `router/navigation.ts` and `http/unauthenticated.ts` — see the
routing decision below for why those two came before the router itself.

Verify with, from `web-next/`:

```
npm run lint && npm run type-check && npm run build-only
npm run test:unit -- --run --coverage
```

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

**Routing: react-router-dom 7.** The route table maps over directly; the pieces
needing deliberate design are the three guards (`auth`, `guest`, `landing` —
today `beforeEnter`, in React either loaders or a wrapper component) and the
global `beforeEach` that sets the page title from `meta.titleKey` and resets the
nav-tab and action-button stores on navigation. `router/tabs.ts` is pure data and
already ported.

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

## What to do next

Every remaining store reads from `http/requests.ts`, so **phase C comes before
the rest of phase B**. The dependency order is fixed and worth following:

1. **`http/requests.ts`** — 663 lines, and the gate on everything else. It is
   mostly thin wrappers over the generated Connect clients, so the work is bulk
   rather than difficulty. Its dependencies are all in place now except
   `http/clients.ts`, which needs `interceptors` and `offlineCache`.
2. **`http/clients.ts`, `http/interceptors.ts`, `http/offlineCache.ts`** — port
   alongside it, with the three specs from `web/src/http/`. `interceptors.ts`
   and `offlineCache.ts` read the auth and connection stores, both of which are
   ported, so this is a `useXStore()` → `useXStore.getState()` change and
   nothing more.
3. **`jwt/jwt.ts`** — small, but it closes the loop: `interceptors` calls it and
   it calls `requests.refreshToken`.
4. **The request-backed stores**: `streak`, `notifications`, `activity`,
   `dashboard`, `plans`, `progress`. Before porting these as-is, check whether
   they are really server cache rather than client state — several would be
   plainer as a data-fetching hook, and this is the moment to decide that, not
   after 20 components depend on the store shape.
5. **`mutationQueue`** — the one with a real design question. It calls
   `useConnectionStore().onReconnect(…)` at module-init time, so importing the
   store has a side effect. In React that wiring belongs in an app-level effect;
   decide where and write it down here, because `notifications` polling has the
   same shape.
6. **`workout`** last — a deep nested map mutated by path, and the reason Immer
   is already a dependency. Port it with the Immer middleware, and lean on
   `web/src/stores/workout.spec.ts`, which is thorough.

Then routing: the route table, the three guards, and the global navigation
effect that sets the page title and resets `navTabs` and `actionButton`.
Whatever creates the router must also call `setNavigator(router.navigate)`.

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
discovered at the end. It currently sits at 88% statements / 90% lines.

Expect it to fall once components land — the ported modules are unusually easy
to cover. `src/proto`, `src/main.tsx` and the specs are excluded in
`vitest.config.ts`; nothing else is.

Of the 38 specs in `web/src`, 22 test plain modules and port with little change;
the 16 that mount `.vue` SFCs need rewriting against Testing Library. Two
filesystem guards in `web/tests/` (`no-hardcoded-strings.spec.ts`,
`no-raw-palettes.spec.ts`) are regex scanners — port them in phase D and change
the extension globs from `.vue` to `.tsx`.
