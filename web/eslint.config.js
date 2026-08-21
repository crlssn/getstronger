import pluginVitest from '@vitest/eslint-plugin'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    name: 'app/files-to-lint',
  },

  {
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'src/proto/**'],
    name: 'app/files-to-ignore',
  },

  ...vueTsEslintConfig(),

  {
    files: ['**/*.vue'],
    name: 'app/vue-component-resolution',
    rules: {
      // A component used in a template but never imported does not fail the
      // build — Vue renders an inert unknown element and the UI silently
      // loses whatever that component was meant to show.
      'vue/no-undef-components': [
        'error',
        { ignorePatterns: ['RouterLink', 'RouterView', 'i18n-t'] },
      ],
    },
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },
]
