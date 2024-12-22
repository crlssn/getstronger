import type { AccessToken } from '@/types/auth.ts'

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const userId = ref('')
    const accessToken = ref('')

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
    }

    const authorised = computed(() => {
      return userId.value !== '' && accessToken.value !== ''
    })

    return {
      accessToken,
      logout,
      setAccessToken,
      userId,
      authorised,
    }
  },
  {
    persist: true,
  },
)
