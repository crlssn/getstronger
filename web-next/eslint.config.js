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

  {
    ...pluginVitest.configs.recommended,
    // Unit specs only. The end-to-end specs share the .spec.ts suffix but run
    // under Playwright, whose expect these rules do not describe.
    files: ['**/*.spec.{ts,tsx}'],
    ignores: ['tests/e2e/**'],
    rules: {
      ...pluginVitest.configs.recommended.rules,
      // Vitest's expect takes an optional second argument: the message shown
      // when the assertion fails. The rule defaults to rejecting it.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },

  prettier,
)
