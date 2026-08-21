import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { logout } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'

/**
 * Signs the user out, then sends them to the login screen.
 *
 * A route rather than a button so anything can link to it, and so the sign-out
 * survives the navigation that follows it.
 */
export const UserLogout = () => {
  const navigate = useNavigate()

  // Signing out twice would tell the backend to revoke a token it has already
  // revoked; an effect can run twice in development.
  const signingOut = useRef(false)

  useEffect(() => {
    if (signingOut.current) return
    signingOut.current = true

    const signOut = async () => {
      await logout()
      useAuthStore.getState().logout()
      usePreferencesStore.getState().reset()
      useNotificationStore.getState().stopUnreadNotifications()
      void navigate('/login')
    }

    void signOut()
  }, [navigate])

  return null
}
