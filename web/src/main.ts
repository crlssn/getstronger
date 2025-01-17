import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications.ts'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import VueGtag from 'vue-gtag'

import App from './App.vue'
import router from './router/router'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)

if (import.meta.env.VITE_ENABLE_GOOGLE_ANALYTICS === 'true') {
  app.use(VueGtag, {
    config: {
      id: import.meta.env.VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID,
    },
  })
}

const init = async () => {
  const authStore = useAuthStore()
  if (authStore.authorised) {
    await refreshAccessTokenOrLogout()

    const notificationStore = useNotificationStore()
    notificationStore.streamUnreadNotifications()
  }

  console.log('App initialized')
  app.mount('#app')
}

init().catch((error) => {
  console.error(error)
})
