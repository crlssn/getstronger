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
  useAuthStore.getState().logout()
}
