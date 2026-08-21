import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'

// Matches the server-side cooldown and is only a starting point: every resend
// response carries the cooldown the server is actually enforcing.
export const defaultResendCooldownSeconds = 60

interface EmailVerificationState {
  pendingEmail: string
  lastSentAt: number
  retryAfterSeconds: number
  setPendingEmail: (email: string) => void
  markSent: (email: string, cooldownSeconds?: number) => void
  clear: () => void
}

export const selectHasPendingEmail = (state: EmailVerificationState) => state.pendingEmail !== ''

const cleared = {
  pendingEmail: '',
  lastSentAt: 0,
  retryAfterSeconds: defaultResendCooldownSeconds,
}

// The address of an account that is waiting for email verification. It is kept
// in session storage rather than local storage: a reload must not lose the
// recovery path, but the address must not outlive the browser session on a
// shared device.
export const useEmailVerificationStore = create<EmailVerificationState>()(
  persist(
    (set, get) => ({
      ...cleared,

      // Records the address without claiming an email was sent, for example
      // after a login attempt on an unverified account.
      setPendingEmail: (email) => {
        if (email === get().pendingEmail) return
        set({ ...cleared, pendingEmail: email })
      },

      // Starts the cooldown for an address a verification email was just sent
      // to.
      markSent: (email, cooldownSeconds = defaultResendCooldownSeconds) =>
        set({
          pendingEmail: email,
          lastSentAt: Date.now(),
          retryAfterSeconds: cooldownSeconds > 0 ? cooldownSeconds : defaultResendCooldownSeconds,
        }),

      clear: () => set(cleared),
    }),
    {
      name: 'emailVerification',
      storage: migratedStorage(() => sessionStorage),
      partialize: ({ pendingEmail, lastSentAt, retryAfterSeconds }) => ({
        pendingEmail,
        lastSentAt,
        retryAfterSeconds,
      }),
    },
  ),
)
