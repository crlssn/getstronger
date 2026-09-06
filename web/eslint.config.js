import react from '@eslint-react/eslint-plugin'
import js from '@eslint/js'
import pluginVitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import i18next from 'eslint-plugin-i18next'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// eslint-plugin-react is deliberately absent. Its recommended set is built
// around prop-types and the pre-17 JSX runtime, both of which TypeScript and
// the automatic runtime already cover; react-hooks is the rule set that still
// catches real bugs.
export default tseslint.config(
  {
    // design-sync scaffolding: the library build it generates (ds-dist), the
    // bundle it uploads (ds-bundle), the converter it stages (.ds-sync) and the
    // inputs it keeps (.design-sync). None of it ships with the app, and the
    // generated declarations are outside every tsconfig the type-aware rules
    // know about — see web/.design-sync/NOTES.md.
    ignores: [
      '**/dist/**',
      '**/dist-ssr/**',
      '**/coverage/**',
      'src/proto/**',
      'ds-dist/**',
      'ds-bundle/**',
      '.ds-sync/**',
      '.design-sync/**',
    ],
    name: 'app/files-to-ignore',
  },

  // The type-aware set, not the syntactic one. A promise nobody awaits and a
  // catch that swallows a non-Error look identical to a parser and obvious to
  // a type checker; every tsconfig here is already built by 'type-check', so
  // the program these rules need is one this project pays for anyway.
  {
    files: ['**/*.{ts,tsx}'],
    name: 'app/files-to-lint',
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A leading underscore is how the codebase already marks a binding that
      // exists to hold a position rather than to be read.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      // React Router signals a redirect by throwing the Response that performs
      // it, which is the documented API rather than an error being abused.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'lib', name: 'Response' }] },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    name: 'app/react',
    extends: [react.configs['recommended-typescript']],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Wants every ref named `somethingRef`. The app names refs after the
      // thing they hold, which reads better in the JSX that uses them.
      '@eslint-react/naming-convention-ref-name': 'off',
      // Wants `setX` for every `useState` pair. `usePagination` returns a
      // reducer-shaped pair the convention does not describe.
      '@eslint-react/use-state': 'off',
      // Three hooks seed state from a DOM measurement on mount and then
      // subscribe — a carousel's scroll position, a row's overflowing edges,
      // the height the on-screen keyboard takes. There is no event to read
      // them from before the element exists, so the first read is an effect by
      // construction, and each already skips the render when nothing moved.
      '@eslint-react/set-state-in-effect': 'off',
    },
  },

  // The design system is a rule, not a suggestion: a screen that reaches for a
  // bare control is a screen inventing a fifth button style. `ui/components`
  // is where controls are allowed to be built, and everywhere else composes
  // them. Genuinely local exceptions disable this line by line, with the
  // reason written where a reviewer will read it.
  {
    files: ['src/ui/**/*.tsx'],
    ignores: ['src/ui/components/**', '**/*.spec.tsx'],
    name: 'app/design-system',
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            'Use <AppButton>, <AppIconButton> or <AppOptionRow> from @/ui/components. A control that none of them covers is added to the design system first — see src/ui/components/README.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name="input"]',
          message:
            'Use <AppInput>, <AppNumberField>, <AppDurationInput>, <AppSearchField> or <AppSwitch> from @/ui/components. A field that none of them covers is added to the design system first — see src/ui/components/README.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message: 'Use <AppTextarea> from @/ui/components.',
        },
        // Navigation is a component too. A hand-drawn anchor is how a screen
        // ends up with a link that does not look tappable — which is the same
        // mistake as a fifth button style, one element down.
        {
          selector: 'JSXOpeningElement[name.name="a"]',
          message:
            'Use <AppButton type="link"> for a button that goes somewhere, or <AppListRow to> for a row that does. A link leaving the app disables this line with the reason.',
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message:
            'The app has no select. Use <AppSegmented> for a few options, or add one to the design system.',
        },
        // Deprecated, and removed after one release. Both of these describe
        // themselves as a row, and <AppListRow> is the one with fixed slots
        // and a chevron on every row that navigates.
        {
          selector: 'JSXOpeningElement[name.name="AppListItem"]',
          message:
            'Use <AppListRow> from @/ui/components. is="danger" is tone="danger" there, is="header" is <AppList heading>, and content that is none of leading, title, meta or trailing is not a list row — see src/ui/components/README.md.',
        },
        {
          selector: 'JSXOpeningElement[name.name="AppListItemLink"]',
          message:
            'Use <AppListRow to> from @/ui/components, which draws the chevron that says the row goes somewhere.',
        },
      ],
    },
  },

  // The other half of the same rule. web/CLAUDE.md answers "may I reuse this?"
  // with the directory a file is in, and a directory only means that while the
  // arrows point one way: the design system knows nothing about the app, and a
  // domain widget knows nothing about the chrome it is rendered in.
  {
    files: ['src/ui/components/**/*.{ts,tsx}'],
    ignores: ['**/*.spec.{ts,tsx}'],
    name: 'app/design-system-imports',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/ui/features/*', '@/ui/shell/*', '@/stores/*', '@/http/*', '@/proto/*'],
              message:
                'The design system is domain-free: it takes props and gives back events. A component that needs a store, a request or a generated type belongs in ui/features — see web/CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/ui/features/**/*.{ts,tsx}'],
    ignores: ['**/*.spec.{ts,tsx}'],
    name: 'app/feature-imports',
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/ui/shell/*'],
              message:
                'The chrome renders the widget, not the other way round. A widget that needs the shell wants a prop from whoever placed it.',
            },
          ],
        },
      ],
    },
  },

  // Every user-facing string goes through i18next, and until now nothing but
  // review said so. jsx-text-only: the rule's stricter modes flag every string
  // literal in the file, including class names and test ids.
  {
    files: ['src/ui/**/*.tsx'],
    ignores: ['**/*.spec.tsx'],
    name: 'app/localisation',
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] },
  },

  // The end-to-end suite already fails on a WCAG violation through axe. These
  // are the subset a linter can see without running the app, which is a good
  // deal earlier.
  {
    files: ['**/*.tsx'],
    name: 'app/accessibility',
    extends: [jsxA11y.flatConfigs.recommended],
    rules: {
      // Tailwind's preflight sets `list-style: none` on every ul, and VoiceOver
      // stops announcing a list that has no markers. `role="list"` is redundant
      // in the specification and load-bearing in Safari.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'] }],
    },
  },

  {
    ...pluginVitest.configs.recommended,
    // Unit specs only. The Playwright specs under tests/ share the .spec.ts
    // suffix but run under a different expect, which these rules do not
    // describe.
    files: ['**/*.spec.{ts,tsx}'],
    ignores: ['tests/e2e/**', 'tests/screenshots/**'],
    rules: {
      ...pluginVitest.configs.recommended.rules,
      // Vitest's expect takes an optional second argument: the message shown
      // when the assertion fails. The rule defaults to rejecting it.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },

  // A test harness deals in `any` on purpose: JSON.parse of what a store
  // persisted, expect.objectContaining, a mock whose signature is async
  // whether or not that particular body awaits. The type-aware rules describe
  // product code, and .golangci.yml exempts _test.go from its equivalents for
  // the same reason.
  {
    files: ['**/*.spec.{ts,tsx}', 'tests/**/*.ts'],
    name: 'app/test-harness',
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  prettier,
)
