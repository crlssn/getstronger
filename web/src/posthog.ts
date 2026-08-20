import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY
const host = import.meta.env.VITE_POSTHOG_HOST

export const isPostHogConfigured = Boolean(key && host)

if (key && host) {
  posthog.init(key, {
    api_host: host,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  })
} else if (import.meta.env.DEV) {
  const missingVariable = !key ? 'VITE_POSTHOG_KEY' : 'VITE_POSTHOG_HOST'
  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  )
}

export const identifyUser = (userId: string) => {
  if (isPostHogConfigured && userId) posthog.identify(userId)
}

export const resetUser = () => {
  if (isPostHogConfigured) posthog.reset()
}

export default posthog
