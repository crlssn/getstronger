import {ref} from 'vue'
import {defineStore} from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(null)
  const accessTokenRefreshInterval = ref(null)

  function setAccessToken(token: string): void {
    console.log('setting access token', token)
    // localStorage.setItem('accessToken', token)
    accessToken.value = token
  }

  function logout() {
    // localStorage.removeItem('accessToken')
    accessToken.value = null
    clearInterval(accessTokenRefreshInterval.value)
  }

  function setAccessTokenRefreshInterval(interval: number) {
    accessTokenRefreshInterval.value = interval
  }

  return {accessToken, setAccessToken, logout, setAccessTokenRefreshInterval}
}, {
  persist: true,
})
