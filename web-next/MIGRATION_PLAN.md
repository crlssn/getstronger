# Vue → React migration (issue #1100)

`web-next/` is the React app under construction. `web/` is the live Vue app and
stays untouched and shipping until the swap in phase H. Nothing in `web/` should
be edited for this migration.

This file is the handover between sessions. **Read it first, update it last.**
The "Where we are" section is the source of truth for what to pick up next.

## Where we are

Phase A is done and phase B is under way: the React toolchain builds,
typechecks, lints, formats and tests; every module that never depended on Vue is
ported; and i18n now runs on i18next. 69 tests green.

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
(plurals converted, see below), and `utils/{numbers,datetime,exerciseMeasurements}.ts`
(`i18n.global.t` → `i18n.t`, nothing else).

Verify with, from `web-next/`:

```
npm run lint && npm run type-check && npm run test:unit -- --run && npm run build-only
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

## Phase B — what to do next

i18n is done. The remaining work is the 21 Pinia stores in `web/src/stores/`,
then routing.

1. Settle the Zustand store shape on one small store first — `alerts` is a good
   candidate — and write it down here, because 20 more follow it. Decide where
   `persist` goes (the Pinia stores use `persist: true` via
   `pinia-plugin-persistedstate`; Zustand has its own `persist` middleware) and
   whether stores expose actions on the store object or as separate exports.
2. Port the leaves nothing else depends on: `alerts`, `confirmation`,
   `pageTitle`, `navTabs`, `actionButton`, `preferences`.
3. Then `auth`, which the HTTP layer needs. Its `setAccessToken` fires PostHog
   `identify`/`reset` on account _transitions_, not on every write — keep that
   distinction, it is easy to lose.
4. Then `connection` and `mutationQueue`. `mutationQueue` calls
   `useConnectionStore().onReconnect(…)` at module-init time; in React that
   wiring should be explicit at app level rather than a side effect of importing
   the store.
5. `workout` is the big one — a deep nested map mutated by path, and the reason
   Immer is already a dependency. Leave it until the pattern is settled.
6. Port each store's spec alongside it. `auth`, `connection`, `mutationQueue`,
   `notifications`, `streak`, `appVersion` and `workout` all have specs in `web/`
   that should survive with only the store API changing.

Routing comes after the stores, since the global navigation guard resets
`navTabs` and `actionButton` and so needs both to exist.

## Test coverage

The issue asks for 80%+. 22 of the 38 specs in `web/src` test plain modules and
port with little change; the 16 that mount `.vue` SFCs need rewriting against
Testing Library. Two filesystem guards in `web/tests/`
(`no-hardcoded-strings.spec.ts`, `no-raw-palettes.spec.ts`) are regex scanners —
port them in phase D and update the extension globs from `.vue` to `.tsx`.
Coverage is not yet measured here; wire `vitest --coverage` before phase F so the
number is visible while the feature views land rather than after.
