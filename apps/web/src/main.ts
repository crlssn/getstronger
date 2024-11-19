import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

import App from './App.vue'
import router from './router/router'
import { RefreshAccessTokenOrLogout, ScheduleTokenRefresh } from '@/jwt/jwt'
import { useAuthStore } from '@/stores/auth'

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const app = createApp(App)
app.use(pinia)
app.use(router)

const authStore = useAuthStore()
if (authStore.accessToken) {
  RefreshAccessTokenOrLogout().catch((error) => {
    console.log(error)
  })
  authStore.setAccessTokenRefreshInterval(ScheduleTokenRefresh())
}

app.mount('#app')
