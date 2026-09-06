import type { AccessToken } from '@/types/auth'

import { jwtDecode } from 'jwt-decode'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'
import { identifyUser, resetUser } from '@/posthog'

interface AuthState {
  userId: string
  accessToken: string
  /**
   * The last account signed in on this device, kept across the sign-out.
   *
   * Signing out blanks `userId`, so it cannot tell the next sign-in whether the
   * athlete coming back is the one whose drafts the device still holds.
   */
  lastUserId: string
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
      lastUserId: '',

      setAccessToken: (token) => {
        const claims = jwtDecode<AccessToken>(token)
        const wasAuthorised = selectAuthorised(get())
        const isSwitchingAccounts = Boolean(get().userId && get().userId !== claims.userId)

        if (isSwitchingAccounts) resetUser()

        set({ userId: claims.userId, accessToken: token, lastUserId: claims.userId })

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
      partialize: ({ userId, accessToken, lastUserId }) => ({ userId, accessToken, lastUserId }),
    },
  ),
)
