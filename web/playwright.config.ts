import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const localBaseURL = 'http://localhost:15173'
const localBackendURL = 'http://localhost:18080'
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
            SERVER_CERT_PATH: '',
            SERVER_KEY_PATH: '',
            SERVER_PORT: '18080',
            SSE_PORT: '18081',
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: `${localBackendURL}/healthz`,
        },
        {
          command: 'npm run dev -- --host localhost --port 15173',
          cwd: webRoot,
          env: { VITE_API_URL: localBackendURL, VITE_ENABLE_DEVTOOLS: 'false' },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: localBaseURL,
        },
      ],
  workers: 1,
})
