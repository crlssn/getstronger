import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localAuthRatePolicy } from './tests/auth-rate-policy'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
// Its own ports, so a screenshot run and an end-to-end run never fight over a
// server. Ports are per worktree; see 'mise run worktree:env'.
const webPort = process.env.SCREENSHOT_WEB_PORT ?? '15273'
const serverPort = process.env.SCREENSHOT_SERVER_PORT ?? '18280'
const ssePort = process.env.SCREENSHOT_SSE_PORT ?? '18281'
const baseURL = `http://localhost:${webPort}`
const backendURL = `http://localhost:${serverPort}`

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  globalSetup: './tests/screenshots/global-setup.ts',
  globalTeardown: './tests/screenshots/global-teardown.ts',
  outputDir: 'test-results',
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        // A phone-sized viewport at retina density, so the images are legible
        // when they are opened next to each other.
        deviceScaleFactor: 2,
        viewport: { height: 844, width: 390 },
      },
    },
  ],
  reporter: [['list']],
  retries: 0,
  testDir: './tests/screenshots',
  // The one spec that photographs; the harness beside it is unit tested.
  testMatch: 'capture.spec.ts',
  timeout: 60_000,
  use: { baseURL },
  webServer: [
    {
      command: 'mise run app:backend',
      cwd: repositoryRoot,
      env: {
        ...localAuthRatePolicy,
        CORS_ALLOWED_ORIGIN: baseURL,
        EMAIL_PROVIDER: 'noop',
        GOCACHE: join(tmpdir(), 'getstronger-go-cache'),
        SERVER_CERT_PATH: '',
        SERVER_KEY_PATH: '',
        SERVER_PORT: serverPort,
        SSE_PORT: ssePort,
      },
      // Never reuse a server: it may belong to another worktree, which would
      // silently screenshot different code.
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${backendURL}/healthz`,
    },
    {
      command: `npm run dev -- --host localhost --port ${webPort}`,
      cwd: webRoot,
      env: {
        VITE_API_URL: backendURL,
        VITE_ENABLE_DEVTOOLS: 'false',
        // Analytics stays off whatever web/.env holds, so photographing the
        // app neither reports as real traffic nor waits on an unreachable host.
        VITE_POSTHOG_HOST: '',
        VITE_POSTHOG_KEY: '',
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: baseURL,
    },
  ],
  workers: 1,
})
