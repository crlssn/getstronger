import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications.ts'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { initNativePlatform } from '@/native/platform'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { createGtag } from 'vue-gtag'

import posthog, { identifyUser, isPostHogConfigured } from './posthog'
import App from './App.vue'
import { appLocale, i18n } from './i18n'
import router from './router/router'
import { warmLazyRoutesWhenIdle } from './router/warmRoutes'

const app = createApp(App)

// Replacing Vue's default handler silences its console logging, so log first.
app.config.errorHandler = (error, _instance, info) => {
  console.error(error, info)
  if (isPostHogConfigured) posthog.captureException(error)
}

document.documentElement.lang = appLocale
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)
app.use(i18n)

if (import.meta.env.VITE_ENABLE_GOOGLE_ANALYTICS === 'true') {
  app.use(
    createGtag({
      tagId: import.meta.env.VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID,
    }),
  )
}

const init = async () => {
  const authStore = useAuthStore()
  if (authStore.authorised) {
    await refreshAccessTokenOrLogout()

    if (authStore.authorised) {
      identifyUser(authStore.userId)
      const notificationStore = useNotificationStore()
      notificationStore.pollUnreadNotifications()
    }
  }

  console.log('App initialized')
  app.mount('#app')
  // Warm the remaining route chunks so the whole app stays navigable offline.
  warmLazyRoutesWhenIdle(router)

  await initNativePlatform()
}

init().catch((error) => {
  console.error(error)
})
