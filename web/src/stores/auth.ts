import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const accessToken = ref('')
    const accessTokenRefreshInterval = ref(0)

    function setAccessToken(token: string): void {
      console.log('setting access token', token)
      accessToken.value = token
    }

    function logout() {
      accessToken.value = ''
      clearInterval(accessTokenRefreshInterval.value)
    }

    function setAccessTokenRefreshInterval(interval: number) {
      accessTokenRefreshInterval.value = interval
    }

    return { accessToken, logout, setAccessToken, setAccessTokenRefreshInterval }
  },
  {
    persist: true,
  },
)
