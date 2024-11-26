import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { RefreshAccessTokenOrLogout, ScheduleTokenRefresh } from '@/jwt/jwt'

import App from './App.vue'
import router from './router/router'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(router)
app.use(pinia)

const init = async () => {
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    await RefreshAccessTokenOrLogout()
    authStore.setAccessTokenRefreshInterval(ScheduleTokenRefresh())
  }

  app.mount('#app')
}

init()
