import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications.ts'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'

import App from './App.vue'
import router from './router/router'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)

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
