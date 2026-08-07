import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const localBaseURL = 'http://localhost:15173'
const localBackendURL = 'http://localhost:18080'
const baseURL = process.env.E2E_BASE_URL ?? localBaseURL
const remoteTarget = process.env.E2E_BASE_URL !== undefined

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  timeout: 45_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { height: 844, width: 390 },
  },
  webServer: remoteTarget
    ? undefined
    : [
        {
          command: process.env.CI ? 'go run ./server/cmd/main.go' : 'mise run app:backend',
          cwd: repositoryRoot,
          env: {
            CORS_ALLOWED_ORIGIN: localBaseURL,
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
          env: { VITE_API_URL: localBackendURL },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: localBaseURL,
        },
      ],
  workers: 1,
})
