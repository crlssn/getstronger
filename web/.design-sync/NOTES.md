# design-sync notes (web/)

Repo-specific gotchas for future syncs. Read this before re-running anything.

## Why there is a library build

`web` is an app, not a published library: `private: true`, no `exports`, no
`.d.ts`. The converter needs a built entry plus a type tree, so
`.design-sync/build-ds.mjs` makes one into `ds-dist/` (gitignored) and
`cfg.buildCmd` points at it. It is the repo's own toolchain throughout —
Vite with the app's PostCSS/Tailwind config, then `tsc --emitDeclarationOnly`.

- **Bundling `src/` directly does not work.** The CSS Modules are written with
  `@reference` + `@apply`, which esbuild passes through untouched — every
  component would ship unstyled. Vite is what expands them, and it is what
  keeps the CSS-Module hashes in the JS matching the stylesheet.
- **`.d.ts` alias rewrite.** Emitted declarations carry the app's `@/…` alias.
  The converter's ts-morph project has no `paths` config, so `build-ds.mjs`
  rewrites them to relative specifiers. Without it every prop resolves to
  `any`.
- **`ds-dist/package.json` is generated**, so the converter resolves `ds-dist`
  as the design-system package (`getstronger-ds`) and finds `index.d.ts`.

## Tailwind quirks this build works around

- **`@apply` expands only on a CSS Module's first encounter per build.**
  `AppIconButton.module.css` is imported by two components, so one copy comes
  through raw. In the app that copy is a harmless duplicate of an
  already-expanded rule in `index.css`; in a single-file library build it is the
  only copy, and the component renders unstyled. `build-ds.mjs` re-runs Tailwind
  over the compiled sheet and fails the build if any `@apply` survives.
  **This is latent in the app's own build too** — `dist/assets/DropdownButton-*.css`
  ships the unexpanded copy today.
- **Component CSS defines no tokens.** Under `@reference` Tailwind emits
  `var(--x, fallback)` and no `:root` block, so the app's compiled `main.css`
  (tokens, base rules, utilities) is concatenated ahead of it into `ds.css`.
- **`@import 'base.css'`** is bare; Vite resolves it as a sibling, plain PostCSS
  does not. `build-ds.mjs` rewrites it to `./base.css` before processing.

## Authoring previews here

- Import from `'getstronger-ds'`. The provider is wired via `cfg.provider`
  (`DesignSyncProvider` = `I18nextProvider` + `MemoryRouter`, mirroring
  `src/ui/testing.tsx`) — **previews must not wrap it themselves**.
- **Use inline styles for a preview's own layout glue, never Tailwind classes.**
  Tailwind's content scan covers `src/**`, not `.design-sync/previews/`, so a
  utility class used only in a preview is never generated.
- `@heroicons/react/24/outline` imports work in previews and are the right way
  to fill an `icon` prop.
- `AppListRow`, `AppListItem` and `AppListItemLink` render an `<li>` — compose
  them inside `<AppList>` or the markup is invalid and the styling is off.
- Content is the product's own domain: workouts, routines, exercises, kg, rest
  timers. Never `foo`/`bar`.
- **The catalogue can lag the API.** `src/ui/components/README.md` documents
  `AppInput` `variant="card"`; the shipped prop is `'default' | 'hero'`. The
  emitted `<Name>.d.ts` is authoritative — check props against it.

## Preview harness rules in `ds.css`

`build-ds.mjs` appends a short block scoped to the harness's own containers.
All of it is preview-only — `#g` is the grid card and `.ds-single` is what
`?story=` capture swaps in, so **both selectors are needed**; the review sheets
only ever use the second. Nothing here reaches a design built with the system.

- **Card background.** The harness sets `body{background:#fff}` while the app's
  stylesheet puts the canvas on `html`, so cards rendered white content over a
  canvas remainder. The rule puts the card on `--color-canvas`, the background
  these components actually sit on — without it the near-canvas tints
  (`AppChip` neutral, `AppValueChip` collapsed) are unreadable.
- **Fixed positioning.** `.ds-single` and `.ds-cell` carry
  `transform: translateZ(0)`, which makes them the **containing block for any
  `position: fixed` descendant**. `AppSheet`'s backdrop and `AppFormFooter`'s
  bar then resolve `inset: 0` against a box with no height and collapse — the
  sheet renders _above_ the card, almost entirely out of frame. Giving
  `.ds-single` `min-height: 100vh` (and dropping the body padding, so the panel
  is not pushed 24px past the bottom edge) restores the geometry. This looks
  exactly like an animation race and is not one; check the computed height of
  the fixed element before chasing timing.
- **Animation.** A card is a still of the settled state, so animation and
  transition durations are collapsed inside the harness.

## Card overrides

`cfg.overrides` pins `AppSheet`, `SheetAction` and `AppFormFooter` to
`cardMode: single` at a phone-shaped `420x820` viewport: each fills the viewport
rather than sitting in a grid cell. **Changing `cfg.overrides` requires a full
`package-build.mjs`** — a scoped `preview-rebuild` + `package-capture` fails
with `[CONFIG_STALE]` because the grade keys are stamped by the full build.

## The token list is in tokens.css, not the bundle

`ds.css` is the compiled stylesheet, so anything scanning it for custom
properties finds Tailwind's internals rather than the design's tokens: 109
`--tw-*` declared under utility selectors like
`:where(.space-y-* > :not(:last-child))`, plus `--animate-spin`,
`--animate-pulse`, `--default-transition-*` and the `--container-*` sizes. None
of those is a value anybody designs with.

`build-ds.mjs` therefore also emits **`ds-dist/tokens.css`** — the `@theme`
block and the `:root[data-theme='dark']` overrides from `src/assets/theme.css`,
as plain CSS with their comments intact and nothing else. 107 declarations, no
`--tw-*`, no filtering needed. The build fails if either block goes missing.

**Point the sync's token scan at it** rather than at `cssEntry`; the exclusion
of `--tw-*` is the converter's own fix, and this is the input that makes it
unnecessary. `cssEntry` stays `ds.css`: that is the stylesheet the previews
render against, and tokens alone would leave every component unstyled.

## Prop docs are cut at ~120 characters

The converter collapses a JSDoc block to one line and truncates it, so a
comment whose first sentence runs past ~120 characters reaches the design side
mid-word — `AppListRow.to` arrived as "…which is the whole reason this is a
prop rather than ". A component's summary is cut at its first line instead, so
a summary whose opening sentence wraps loses the rest of it.

The rule that avoids both: **the first line of every JSDoc is a complete
sentence, and the first paragraph fits in 120 characters.** Reasoning goes in
a second paragraph, where the cut costs nothing that was not already said.
`catalogue.spec.ts` fails the suite otherwise, so this does not depend on
anyone remembering it.

Tell the `/design-sync` agent about the cut as well — the limit is the
converter's, and raising it is the other half of the fix.

## Known render warns

Triaged as legitimate — a warn NOT in this list is new and worth looking at.

- **`AppLoadMore` — `variants render identically`.** The busy state is a wait
  cursor plus one half-step of grey (`text-text-muted` → `text-text-subtle`),
  so `Loading` really does look like `Default`. Not a fault.

## Components that cannot render in a card

- **`PageNavAction`** portals into a nav-bar slot published by `ui/shell`. With
  no shell above it, it renders `null` — by design. It stays on the floor card
  and is still fully importable.
- **`DropdownButton`'s open menu.** Headless UI opens it on a click, and a
  static card makes none. The previews show the trigger in the positions the app
  uses it; the item list is described in the component's doc instead.

## Docs

`.design-sync/docs/` is generated from `src/ui/components/README.md` by the
splitter in the sync transcript: each `###` section becomes one component's doc
and the enclosing `##` heading becomes its group (actions / input / surfaces /
lists-and-states). Regenerate after editing the catalogue, or the groups and
prompts drift from it.

## Running it again

- `mise run design:build` — the library build only (`ds-dist/`).
- `mise run design:bundle` — build, convert and validate (`ds-bundle/`).
- `mise run design:review` — serve the preview cards to look at them.

Those cover the local half. **Fetching the project's `_ds_sync.json` anchor and
uploading both need the `DesignSync` tool, so the full re-sync is `/design-sync`
in Claude Code**, which also re-stages the converter into the gitignored
`web/.ds-sync/`. A fresh clone has to run the skill once before the
`design:bundle` task will work.

The skill's own one-command re-sync, once the converter is staged and the
anchor has been fetched to `.design-sync/.cache/remote-sync.json`:

```sh
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./ds-dist/index.js \
  --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

## Re-sync risks

- `ds-dist/` is gitignored — a fresh clone must run `cfg.buildCmd` before the
  converter, or the converter exits `[NO_DIST]`.
- The Tailwind post-pass depends on `@tailwindcss/postcss` and `postcss`
  resolving from `web/node_modules`; a Tailwind major bump may change the
  `@reference` semantics this relies on.
- Node is pinned to 24.19.0 via mise. The bare `node` on this machine is 26 —
  run everything through `mise exec --`.
- Preview grades are keyed to the authored `.tsx` files; editing a component's
  props without re-checking its preview can leave a card that renders but no
  longer shows the current API.
