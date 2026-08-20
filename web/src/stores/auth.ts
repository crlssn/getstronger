import type { AccessToken } from '@/types/auth.ts'

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { jwtDecode } from 'jwt-decode'
import { identifyUser, resetUser } from '@/posthog'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const userId = ref('')
    const accessToken = ref('')

    const setAccessToken = (token: string) => {
      const claims = jwtDecode(token) as AccessToken
      const wasAuthorised = authorised.value
      const isSwitchingAccounts = Boolean(userId.value && userId.value !== claims.userId)

      if (isSwitchingAccounts) resetUser()

      userId.value = claims.userId
      accessToken.value = token

      if (!wasAuthorised || isSwitchingAccounts) identifyUser(userId.value)
    }

    const logout = () => {
      if (authorised.value) resetUser()
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
