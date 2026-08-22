import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
// Ports are per worktree so that parallel runs never share a server. See
// 'mise run worktree:env'.
const webPort = process.env.E2E_WEB_PORT ?? '15173'
const serverPort = process.env.E2E_SERVER_PORT ?? '18180'
const ssePort = process.env.E2E_SSE_PORT ?? '18181'
const localBaseURL = `http://localhost:${webPort}`
const localBackendURL = `http://localhost:${serverPort}`
const baseURL = process.env.E2E_BASE_URL ?? localBaseURL
const remoteTarget = process.env.E2E_BASE_URL !== undefined

const localProjects = [
  {
    name: 'chromium-mobile',
    use: { ...devices['Desktop Chrome'], viewport: { height: 844, width: 390 } },
  },
  {
    grep: /@responsive/,
    name: 'chromium-desktop',
    use: { ...devices['Desktop Chrome'], viewport: { height: 900, width: 1440 } },
  },
  {
    grep: /@smoke/,
    name: 'firefox-mobile',
    use: { ...devices['Desktop Firefox'], viewport: { height: 844, width: 390 } },
  },
  {
    grep: /@smoke/,
    name: 'webkit-mobile',
    use: { ...devices['Desktop Safari'], viewport: { height: 844, width: 390 } },
  },
]

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  grep: remoteTarget ? /@smoke/ : undefined,
  outputDir: 'test-results',
  projects: remoteTarget
    ? [
        {
          name: 'chromium-live-smoke',
          use: { ...devices['Desktop Chrome'], viewport: { height: 844, width: 390 } },
        },
      ]
    : localProjects,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 45_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: remoteTarget
    ? undefined
    : [
        {
          command: process.env.CI ? 'go run ./server/cmd/main.go' : 'mise run app:backend',
          cwd: repositoryRoot,
          env: {
            CORS_ALLOWED_ORIGIN: localBaseURL,
            EMAIL_PROVIDER: 'noop',
            GOCACHE: join(tmpdir(), 'getstronger-go-cache'),
            SERVER_CERT_PATH: '',
            SERVER_KEY_PATH: '',
            SERVER_PORT: serverPort,
            SSE_PORT: ssePort,
          },
          // Never reuse a server: it may belong to another worktree, which
          // would silently run these tests against different code.
          reuseExistingServer: false,
          timeout: 120_000,
          url: `${localBackendURL}/healthz`,
        },
        {
          command: `npm run dev -- --host localhost --port ${webPort}`,
          cwd: webRoot,
          env: {
            VITE_API_URL: localBackendURL,
            VITE_ENABLE_DEVTOOLS: 'false',
            // Analytics stays off whatever web/.env holds. A configured PostHog
            // would report test traffic as real, and an unreachable one fails
            // every spec through the no-failed-requests fixture.
            VITE_POSTHOG_HOST: '',
            VITE_POSTHOG_KEY: '',
          },
          reuseExistingServer: false,
          timeout: 120_000,
          url: localBaseURL,
        },
      ],
  workers: 1,
})
