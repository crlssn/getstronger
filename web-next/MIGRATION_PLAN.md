# Vue → React migration (issue #1100)

`web-next/` is the React app under construction. `web/` is the live Vue app and
stays untouched and shipping until the swap in phase H. Nothing in `web/` should
be edited for this migration.

This file is the handover between sessions. **Read it first, update it last.**
The "Where we are" section is the source of truth for what to pick up next.

## Where we are

Phase A is done: the React toolchain builds, typechecks, lints, formats, and runs
tests, and the framework-agnostic leaf modules are ported verbatim with their
tests green.

| Phase | What it covers                                         | State |
| ----- | ------------------------------------------------------ | ----- |
| A     | Toolchain scaffold + framework-agnostic leaves         | done  |
| B     | i18n, state, routing foundations                       | next  |
| C     | HTTP layer and the modules that depend on stores       | todo  |
| D     | Design-system primitives (`AppButton`, `AppCard`, …)   | todo  |
| E     | Shell (`App`, dashboard, nav, banners, dialogs)        | todo  |
| F     | Feature views (auth, workouts, exercises, routines, …) | todo  |
| G     | e2e + screenshot harness pointed at the React app      | todo  |
| H     | Swap `web-next/` into `web/`, delete the Vue app       | todo  |

Ported so far (verbatim, zero edits, 46 tests green):
`brand.ts`, `posthog.ts`, `i18n/messages.ts`, `router/tabs.ts`, `types/*.ts`,
`utils/{blurActiveElement,maskEmail,activityBuckets,distanceUnits,weightUnits}.ts`,
`http/native.ts`, `src/proto/**`, plus the seven specs covering them.

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

**i18n: i18next + react-i18next, with the catalogue kept byte-identical.**
Configure `interpolation: { prefix: '{', suffix: '}' }` so all 104 single-brace
placeholders (`{count}`, `{brand}`) work unchanged. The 24 vue-i18n plural pipe
entries (`'{count} set | {count} sets'`) are the only catalogue edit: convert to
i18next `_one`/`_other` suffixed keys. `messages.spec.ts`'s key-parity test keeps
working, since suffixes land in both locales.

Export the same surface as today's `@/i18n` (`appLocale`, `dateLocale`,
`resolveLocale`, `AppLocale`, `i18n`) so `utils/{numbers,datetime,exerciseMeasurements}.ts`
port with one mechanical change each: `i18n.global.t(…)` → `i18n.t(…)`, 6 call
sites in total.

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
- `web-next/` is not wired into `mise.toml`, CI, or `mobile/capacitor.config.ts`
  (`webDir: '../web/dist'`) on purpose. Phase H does that by moving the directory
  into place, so no config needs to learn about the temporary name.
- The Vue app mounts into `<body id="app">`. React mounts into a `#root` div, so
  `index.html` differs here; `base.css` still styles `#app`, which stays as the
  body id. Check this when porting the shell.

## Phase B — what to do next

1. `src/i18n/index.ts`: i18next instance per the decision above, plus the
   `_one`/`_other` plural conversion in `messages.ts`. Port `i18n/index.spec.ts`.
2. Port `utils/{numbers,datetime,exerciseMeasurements}.ts` and their specs — one
   `i18n.global.t` → `i18n.t` edit each, otherwise verbatim.
3. `src/stores/`: start with the leaf stores that nothing else depends on
   (`alerts`, `confirmation`, `pageTitle`, `navTabs`, `actionButton`,
   `preferences`), then `auth` (needed by the HTTP layer), then `connection` and
   `mutationQueue`. `mutationQueue` registers a callback into `connection` at
   module-init time; in React that wiring wants to be explicit, at app level,
   rather than a side effect of importing the store.
4. Port the store specs as you go — `auth`, `connection`, `mutationQueue`,
   `notifications`, `streak`, `appVersion`, `workout` all have specs in `web/`
   that should survive the port with only the store API changing.

## Test coverage

The issue asks for 80%+. 22 of the 38 specs in `web/src` test plain modules and
port with little change; the 16 that mount `.vue` SFCs need rewriting against
Testing Library. Two filesystem guards in `web/tests/`
(`no-hardcoded-strings.spec.ts`, `no-raw-palettes.spec.ts`) are regex scanners —
port them in phase D and update the extension globs from `.vue` to `.tsx`.
Coverage is not yet measured here; wire `vitest --coverage` before phase F so the
number is visible while the feature views land rather than after.
