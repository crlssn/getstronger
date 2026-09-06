// The typeface first, so its @font-face rules are in the sheet before anything
// asks for them. Imported here rather than from main.css: Vite rewrites and
// emits the font files for a module import, and leaves a plain CSS @import of
// a package pointing at a path that only exists in node_modules.
import '@fontsource-variable/plus-jakarta-sans'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { I18nextProvider } from 'react-i18next'

import { i18n } from '@/i18n'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { initNativePlatform } from '@/native/platform'
import posthog, { identifyUser, isPostHogConfigured } from '@/posthog'
import { setNavigator } from '@/router/navigation'
import { createRouter } from '@/router/router'
import { warmLazyRoutesWhenIdle } from '@/router/warmRoutes'
import { selectAuthorised, useAuthStore } from '@/stores/auth'
import { startLocale, startTheme } from '@/stores/locale'
import { useNotificationStore } from '@/stores/notifications'
import { rehydrated } from '@/stores/persisted'

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('#root element is missing from index.html')

const init = async () => {
  // Inside the native app the stores read from the OS and land a tick after
  // they are created. Everything below reads one — the router's guards run
  // their first loader on creation — so nothing starts until they have.
  // Immediate on the web, where `localStorage` is read synchronously.
  await rehydrated()

  // Before the router, so the first screen renders in the chosen language
  // rather than in the device's and then switching under the reader.
  startLocale()
  // The boot script painted a first answer; this re-applies the stored choice
  // and starts following the device for as long as the app is open.
  startTheme()

  const router = createRouter()
  // Registered before the first render: the HTTP layer redirects through this,
  // and a request fired by a route loader can beat the router's own mount.
  setNavigator((to, options) => router.navigate(to, options))

  if (selectAuthorised(useAuthStore.getState())) {
    await refreshAccessTokenOrLogout()

    if (selectAuthorised(useAuthStore.getState())) {
      identifyUser(useAuthStore.getState().userId)
      useNotificationStore.getState().pollUnreadNotifications()
    }
  }

  console.log('App initialized')
  createRoot(rootElement, {
    // React swallows a render error once it has logged it, so this is where
    // one is reported. The equivalent of Vue's app.config.errorHandler.
    onUncaughtError: (error, info) => {
      console.error(error, info.componentStack)
      if (isPostHogConfigured) posthog.captureException(error)
    },
  }).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </StrictMode>,
  )
  // After a frame, not immediately: `render` schedules the first paint rather
  // than performing it, and sweeping the splash away first shows a blank page.
  requestAnimationFrame(() => document.getElementById('boot-splash')?.remove())

  // Warm the remaining route chunks so the whole app stays navigable offline.
  warmLazyRoutesWhenIdle()

  await initNativePlatform(router)
}

init().catch((error: unknown) => {
  console.error(error)
})
