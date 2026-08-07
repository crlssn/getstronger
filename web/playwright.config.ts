import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const localBaseURL = 'http://localhost:5173'
const baseURL = process.env.E2E_BASE_URL ?? localBaseURL
const remoteTarget = process.env.E2E_BASE_URL !== undefined
const backendHealthURL = process.env.CI
  ? 'http://localhost:8080/healthz'
  : 'https://localhost:8080/healthz'

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
    ignoreHTTPSErrors: !remoteTarget,
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
          ignoreHTTPSErrors: !process.env.CI,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: backendHealthURL,
        },
        {
          command: 'npm run dev -- --host localhost',
          cwd: webRoot,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: localBaseURL,
        },
      ],
  workers: 1,
})
