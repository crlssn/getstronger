import type { Plugin } from 'vite'

// Sources gtag.js loads from, per Google's CSP guidance for Google Analytics 4.
const googleAnalyticsSources = {
  connect: [
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.googletagmanager.com',
  ],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
  script: ['https://*.googletagmanager.com'],
}

/**
 * Builds the Content Security Policy for a production build.
 *
 * Everything is restricted to the app's own origin except the API (whose origin
 * differs from 'self' both on www.getstronger.studio and inside the Capacitor
 * WebView) and, when enabled, Google Analytics. Inline style attributes and
 * data URI images stay allowed: Vue style bindings and @tailwindcss/forms
 * icons rely on them.
 */
export const contentSecurityPolicy = (env: Record<string, string>): string => {
  if (!env.VITE_API_URL) {
    throw new Error('VITE_API_URL must be set to build the Content Security Policy')
  }
  const apiOrigin = new URL(env.VITE_API_URL).origin
  const analytics = env.VITE_ENABLE_GOOGLE_ANALYTICS === 'true'

  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['form-action', ["'self'"]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', ...(analytics ? googleAnalyticsSources.img : [])]],
    ['script-src', ["'self'", ...(analytics ? googleAnalyticsSources.script : [])]],
    ['connect-src', ["'self'", apiOrigin, ...(analytics ? googleAnalyticsSources.connect : [])]],
  ]

  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

/**
 * Injects the Content Security Policy into index.html as a meta tag.
 *
 * The site is static files on Scaleway Object Storage, which cannot set
 * response headers, so the meta tag is the only delivery mechanism. Build-only:
 * the dev server needs cross-port HMR and devtools the policy would block.
 */
export const injectContentSecurityPolicy = (): Plugin => {
  let env: Record<string, string>

  return {
    name: 'inject-content-security-policy',
    apply: 'build',
    configResolved(config) {
      env = config.env
    },
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: contentSecurityPolicy(env),
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}
