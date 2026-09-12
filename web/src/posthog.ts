import posthog from 'posthog-js'
import type { PostHogConfig } from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST

// Unit tests import this module transitively and must never send real events.
const inTest = import.meta.env.MODE === 'test'

export const isPostHogConfigured = Boolean(key && host) && !inTest

/**
 * The options every captured event is built under.
 *
 * Exported so `posthog.spec.ts` can hold the real library to them rather than
 * trust that they still mean what they meant when they were written.
 */
export const postHogOptions: Partial<PostHogConfig> = {
  api_host: host,
  // Pageviews replace Google Analytics; pin SPA route-change capture
  // rather than relying on the library default.
  capture_pageview: 'history_change',
  // A recovery link carries its token in the query string, and posthog-js
  // copies location.href into $current_url verbatim. Redact it there, before
  // the event exists, so no variant of the URL can carry the credential.
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['token'],
  capture_exceptions: {
    capture_unhandled_errors: true,
    capture_unhandled_rejections: true,
    capture_console_errors: false,
  },
}

if (key && host && !inTest) {
  posthog.init(key, postHogOptions)
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
