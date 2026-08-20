import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST

// Unit tests import this module transitively and must never send real events.
const inTest = import.meta.env.MODE === 'test'

export const isPostHogConfigured = Boolean(key && host) && !inTest

if (key && host && !inTest) {
  posthog.init(key, {
    api_host: host,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  })
} else if (import.meta.env.DEV && !inTest) {
  console.warn(
    'PostHog is disabled: set VITE_POSTHOG_KEY and VITE_POSTHOG_HOST in web/.env to capture events.',
  )
}

export const identifyUser = (userId: string) => {
  if (isPostHogConfigured && userId) posthog.identify(userId)
}

export const resetUser = () => {
  if (isPostHogConfigured) posthog.reset()
}

export default posthog
