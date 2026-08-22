import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST

// Analytics belong to the deployed app alone. A development server never
// reaches PostHog, whatever a local web/.env holds — which also keeps the unit
// and browser suites, both of which run against one, from sending real events.
// Production takes its key and host from the deploy workflow.
const inProduction = import.meta.env.PROD

export const isPostHogConfigured = Boolean(key && host) && inProduction

if (key && host && inProduction) {
  posthog.init(key, {
    api_host: host,
    // Pageviews replace Google Analytics; pin SPA route-change capture
    // rather than relying on the library default.
    capture_pageview: 'history_change',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  })
}

export const identifyUser = (userId: string) => {
  if (isPostHogConfigured && userId) posthog.identify(userId)
}

export const resetUser = () => {
  if (isPostHogConfigured) posthog.reset()
}

export default posthog
