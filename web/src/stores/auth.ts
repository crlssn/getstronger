import type { AccessToken } from '@/types/auth.ts'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const userId = ref('')
    const accessToken = ref('')
    const accessTokenRefreshInterval = ref(0)

    const setAccessToken = (token: string) => {
      if (userId.value === '') {
        const claims = jwtDecode(token) as AccessToken
        userId.value = claims.userId
      }
      accessToken.value = token
    }

    const logout = () => {
      userId.value = ''
      accessToken.value = ''
      clearInterval(accessTokenRefreshInterval.value)
    }

    const setAccessTokenRefreshInterval = (interval: number) => {
      accessTokenRefreshInterval.value = interval
    }

    const authorised = () => {
      return userId.value !== '' && accessToken.value !== ''
    }

    return {
      accessToken,
      logout,
      setAccessToken,
      setAccessTokenRefreshInterval,
      userId,
      authorised,
    }
  },
  {
    persist: true,
  },
)
