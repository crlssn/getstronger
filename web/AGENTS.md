# Web rules (`web/`)

Vue 3 + TypeScript + Tailwind. `src/ui/` holds views and components, `src/stores/`
the state, `src/proto/` generated Connect clients that are never edited by hand.

Verify with `mise run test:web` (build plus unit tests) and `mise run lint:web`.
Flows that cross the UI, backend, and database also need an end-to-end test:
`mise run test:e2e`.

To see the app rather than reason about its markup — screenshots, accessibility
and tap-target measurements, visual diffs — follow
`.claude/skills/design-review/SKILL.md`.

## Localisation

Every user-facing string must go through vue-i18n. Never hard-code English text
in components — the only exceptions are the brand assets in `src/brand.ts` (the
product name, slogan, and signup subtitle), which read the same in every locale
and must never enter the message catalogues. `brand.spec.ts` fails if a
catalogue value contains any of them.

- Add every new string to `src/i18n/messages.ts` in **every supported locale**,
  and render it with `t()`. The test suite enforces key parity between locales,
  so a key added to one locale only will fail `messages.spec.ts`.
- This covers more than template text: aria-labels, input placeholders, confirm
  dialogs, alert toasts, dropdown item titles, page-title fallbacks, and strings
  built in `<script setup>` all count as user-facing.
- Reuse an existing key when one already says the same thing (check `common.*`
  first) instead of adding a near-duplicate.
- Use vue-i18n plural pipes for counts (`'{count} set logged | {count} sets
  logged'`) rather than ternaries on `count === 1`.
- Components using `t()` need the i18n plugin in their specs: mount with
  `global: { plugins: [i18n] }` (import `i18n` from `@/i18n`).
- When adding or changing translations in a non-English locale, match the
  terminology and tone already used in that locale's catalogue rather than
  translating each string in isolation.
