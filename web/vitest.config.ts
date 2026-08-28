import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      // Only the capture run itself is a Playwright spec; the rest of the
      // screenshot harness is ordinary code with ordinary unit tests.
      exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/screenshots/capture.spec.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Generated Connect clients, and the entry points whose whole job is
        // wiring the app to the browser — neither is product logic a unit test
        // can say anything useful about.
        exclude: ['src/proto/**', 'src/main.tsx', 'src/**/*.spec.{ts,tsx}'],
        reporter: ['text-summary', 'lcov'],
      },
    },
  }),
)
