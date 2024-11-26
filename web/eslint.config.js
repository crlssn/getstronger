import vueTsEslintConfig from '@vue/eslint-config-typescript'
import perfectionist from 'eslint-plugin-perfectionist'
import pluginVitest from '@vitest/eslint-plugin'
import pluginVue from 'eslint-plugin-vue'

export default [
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    name: 'app/files-to-lint',
  },

  {
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', 'src/proto/**'],
    name: 'app/files-to-ignore',
  },

  perfectionist.configs['recommended-natural'],
  ...pluginVue.configs['flat/recommended'],
  ...vueTsEslintConfig(),

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },
]
