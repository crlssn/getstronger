// Browser suites repeatedly sign in as the same seeded people. These larger
// budgets apply only to the local test servers, never to a deployed target.
export const localAuthRatePolicy = {
  AUTH_RATE_ACCOUNT_ATTEMPTS: '100',
  AUTH_RATE_ACCOUNT_WINDOW: '15m',
  AUTH_RATE_SOURCE_ATTEMPTS: '1000',
  AUTH_RATE_SOURCE_WINDOW: '1m',
}
