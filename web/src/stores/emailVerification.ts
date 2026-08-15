import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Matches the server-side cooldown and is only a starting point: every resend
// response carries the cooldown the server is actually enforcing.
export const defaultResendCooldownSeconds = 60

// The address of an account that is waiting for email verification. It is kept
// in session storage rather than local storage: a reload must not lose the
// recovery path, but the address must not outlive the browser session on a
// shared device.
export const useEmailVerificationStore = defineStore(
  'emailVerification',
  () => {
    const pendingEmail = ref('')
    const lastSentAt = ref(0)
    const retryAfterSeconds = ref(defaultResendCooldownSeconds)

    const hasPendingEmail = computed(() => pendingEmail.value !== '')

    // setPendingEmail records the address without claiming an email was sent,
    // for example after a login attempt on an unverified account.
    const setPendingEmail = (email: string) => {
      if (email === pendingEmail.value) return
      pendingEmail.value = email
      lastSentAt.value = 0
      retryAfterSeconds.value = defaultResendCooldownSeconds
    }

    // markSent starts the cooldown for an address a verification email was just
    // sent to.
    const markSent = (email: string, cooldownSeconds = defaultResendCooldownSeconds) => {
      pendingEmail.value = email
      lastSentAt.value = Date.now()
      retryAfterSeconds.value = cooldownSeconds > 0 ? cooldownSeconds : defaultResendCooldownSeconds
    }

    const clear = () => {
      pendingEmail.value = ''
      lastSentAt.value = 0
      retryAfterSeconds.value = defaultResendCooldownSeconds
    }

    return {
      clear,
      hasPendingEmail,
      lastSentAt,
      markSent,
      pendingEmail,
      retryAfterSeconds,
      setPendingEmail,
    }
  },
  {
    persist: {
      storage: sessionStorage,
    },
  },
)
