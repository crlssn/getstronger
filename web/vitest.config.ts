import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config.ts'
import { suiteTimeZone } from './tests/timeZone.ts'

// The app renders the reader's local clock, so every spec that fixes an
// instant is asserting about a zone. Pin it before the workers start and the
// assertion holds on any machine; leave it to the machine and it holds only on
// CI's. Set here rather than in `test.env`, which lands too late for the zone
// Node has already resolved. See tests/timeZone.ts for why this one, not UTC.
process.env.TZ = suiteTimeZone

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
