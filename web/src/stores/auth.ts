import type { AccessToken } from '@/types/auth.ts'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const userID = ref('')
    const accessToken = ref('')
    const accessTokenRefreshInterval = ref(0)

    const setAccessToken = (token: string) => {
      console.log('setting access token', token)
      if (userID.value === '') {
        const claims = jwtDecode(token) as AccessToken
        userID.value = claims.user_id
      }
      accessToken.value = token
    }

    const logout = () => {
      userID.value = ''
      accessToken.value = ''
      clearInterval(accessTokenRefreshInterval.value)
    }

    const setAccessTokenRefreshInterval = (interval: number) => {
      accessTokenRefreshInterval.value = interval
    }

    return { accessToken, logout, setAccessToken, setAccessTokenRefreshInterval, userID }
  },
  {
    persist: true,
  },
)
