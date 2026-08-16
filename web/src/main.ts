import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications.ts'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { initNativePlatform } from '@/native/platform'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { createGtag } from 'vue-gtag'

import App from './App.vue'
import { appLocale, i18n } from './i18n'
import router from './router/router'

const app = createApp(App)

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
      const notificationStore = useNotificationStore()
      notificationStore.streamUnreadNotifications()
    }
  }

  console.log('App initialized')
  app.mount('#app')

  await initNativePlatform()
}

init().catch((error) => {
  console.error(error)
})
