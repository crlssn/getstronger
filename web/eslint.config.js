import js from '@eslint/js'
import pluginVitest from '@vitest/eslint-plugin'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// eslint-plugin-react is deliberately absent. Its recommended set is built
// around prop-types and the pre-17 JSX runtime, both of which TypeScript and
// the automatic runtime already cover; react-hooks is the rule set that still
// catches real bugs.
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'src/proto/**'],
    name: 'app/files-to-ignore',
  },

  {
    files: ['**/*.{ts,tsx}'],
    name: 'app/files-to-lint',
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // A leading underscore is how the codebase already marks a binding that
      // exists to hold a position rather than to be read.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    name: 'app/react',
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
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
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message:
            'The app has no select. Use <AppSegmented> for a few options, or add one to the design system.',
        },
      ],
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

  prettier,
)
