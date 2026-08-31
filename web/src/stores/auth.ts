import type { AccessToken } from '@/types/auth'

import { jwtDecode } from 'jwt-decode'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'
import { identifyUser, resetUser } from '@/posthog'

interface AuthState {
  userId: string
  accessToken: string
  setAccessToken: (token: string) => void
  logout: () => void
}

export const selectAuthorised = (state: AuthState) =>
  state.userId !== '' && state.accessToken !== ''

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      userId: '',
      accessToken: '',

      setAccessToken: (token) => {
        const claims = jwtDecode<AccessToken>(token)
        const wasAuthorised = selectAuthorised(get())
        const isSwitchingAccounts = Boolean(get().userId && get().userId !== claims.userId)

        if (isSwitchingAccounts) resetUser()

        set({ userId: claims.userId, accessToken: token })

        if (!wasAuthorised || isSwitchingAccounts) identifyUser(claims.userId)
      },

      logout: () => {
        if (selectAuthorised(get())) resetUser()
        set({ userId: '', accessToken: '' })
      },
    }),
    {
      name: 'auth',
      storage: migratedStorage(),
      partialize: ({ userId, accessToken }) => ({ userId, accessToken }),
    },
  ),
)
