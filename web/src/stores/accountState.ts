import type { AccessToken } from '@/types/auth'

import { jwtDecode } from 'jwt-decode'

import { clearOfflineCache } from '@/http/offlineCache'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useWorkoutStore } from '@/stores/workout'

/**
 * Wipes everything on the device that belongs to the signed-in account.
 *
 * Logging out only has to end the session, because the same person signs back
 * in and wants their drafts. Deleting the account has nothing to come back to:
 * a queued mutation would replay against an account the server no longer has,
 * and an unsaved workout would surface for whoever signs in on the phone next.
 */
export const clearAccountState = () => {
  useNotificationStore.getState().stopUnreadNotifications()
  useMutationQueueStore.getState().clear()
  useWorkoutStore.setState({ workouts: {} })
  useDashboardStore.setState({ preferredRoutineId: '', dashboard: undefined, loading: false })
  useEmailVerificationStore.getState().clear()
  usePreferencesStore.getState().reset()
  clearOfflineCache()
  useAuthStore.getState().logout()
}

/**
 * Opens a session for the account the token names, and gives it a clean device
 * if the last one to use it was somebody else.
 *
 * A sign-out leaves the drafts, the queued workouts and the cached reads where
 * they are, because the athlete who signed out is usually the one signing back
 * in. A different account is the phone changing hands, and inherits none of it
 * — not the tab bar's ticking session, and not a quick workout, whose draft is
 * filed under a constant that both accounts would otherwise share.
 */
export const startAccountSession = (accessToken: string) => {
  const { userId } = jwtDecode<AccessToken>(accessToken)
  const { lastUserId } = useAuthStore.getState()

  if (lastUserId && lastUserId !== userId) clearAccountState()
  useAuthStore.getState().setAccessToken(accessToken)
}
