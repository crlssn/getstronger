<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ClockIcon } from '@heroicons/vue/24/outline'
import AppButton from '@/ui/components/AppButton.vue'
import { resendVerificationEmail } from '@/http/requests'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { maskEmail } from '@/utils/maskEmail'

const { t } = useI18n()
const emailVerificationStore = useEmailVerificationStore()

type ResendStatus = 'failed' | 'idle' | 'sending' | 'sent'

const status = ref<ResendStatus>('idle')
const email = ref('')
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

const maskedEmail = computed(() => maskEmail(emailVerificationStore.pendingEmail))
// The address is only shown when it can be masked, so that an unusable or
// unexpected value is never printed in full.
const knowsDestination = computed(() => maskedEmail.value !== '')

const secondsRemaining = computed(() => {
  if (!emailVerificationStore.lastSentAt) return 0
  const elapsed = (now.value - emailVerificationStore.lastSentAt) / 1000
  return Math.max(0, Math.ceil(emailVerificationStore.retryAfterSeconds - elapsed))
})

const cooling = computed(() => secondsRemaining.value > 0)

const destination = computed(() =>
  emailVerificationStore.hasPendingEmail ? emailVerificationStore.pendingEmail : email.value.trim(),
)

const canResend = computed(
  () => !cooling.value && status.value !== 'sending' && destination.value !== '',
)

const resendLabel = computed(() => {
  if (status.value === 'sending') return t('auth.verification.resending')
  if (cooling.value)
    return t('auth.verification.cooldownButton', { seconds: secondsRemaining.value })
  return t('auth.verification.resend')
})

const onResend = async () => {
  if (!canResend.value) return

  const address = destination.value
  status.value = 'sending'

  const res = await resendVerificationEmail(address)
  if (!res) {
    status.value = 'failed'
    return
  }

  emailVerificationStore.markSent(address, res.retryAfterSeconds)
  email.value = ''
  status.value = 'sent'
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ t('auth.verification.eyebrow') }}</p>
      <h1>{{ t('auth.verification.title') }}</h1>
      <p v-if="knowsDestination" class="verification-destination">
        {{ t('auth.verification.sentTo', { email: maskedEmail }) }}
      </p>
      <p v-else>{{ t('auth.verification.unknownDestination') }}</p>
    </header>

    <div class="verification-pending">
      <ClockIcon class="verification-pending-icon" aria-hidden="true" />
      <div class="verification-pending-body">
        <p class="verification-pending-label">{{ t('auth.verification.pendingLabel') }}</p>
        <p>{{ t('auth.verification.instructions') }}</p>
      </div>
    </div>

    <form class="auth-form" method="POST" @submit.prevent="onResend">
      <p class="verification-hint">{{ t('auth.verification.notReceived') }}</p>

      <div v-if="!emailVerificationStore.hasPendingEmail">
        <label for="verification-email" class="auth-label">{{ t('auth.email') }}</label>
        <div class="mt-2">
          <input
            id="verification-email"
            v-model="email"
            name="email"
            type="email"
            autocomplete="email"
            class="auth-input"
            inputmode="email"
            required
          />
        </div>
      </div>

      <AppButton
        type="submit"
        colour="primary"
        class="auth-submit"
        :disabled="!canResend"
        :aria-busy="status === 'sending'"
      >
        {{ resendLabel }}
      </AppButton>

      <!-- The countdown itself is the button's label, so the live region only
           reports what changed. -->
      <p class="verification-status" role="status" aria-live="polite">
        <span v-if="status === 'sending'">{{ t('auth.verification.resending') }}</span>
        <span v-else-if="status === 'sent'">{{ t('auth.verification.resent') }}</span>
      </p>

      <p v-if="status === 'failed'" class="verification-error" role="alert">
        {{ t('auth.verification.resendFailed') }}
      </p>
    </form>

    <p class="auth-footer">
      {{ t('auth.verification.differentEmailHelp') }}
      <RouterLink to="/signup" class="auth-link">{{
        t('auth.verification.differentEmail')
      }}</RouterLink>
    </p>

    <p class="auth-footer">
      <RouterLink to="/login" class="auth-link">{{
        t('auth.verification.backToLogin')
      }}</RouterLink>
    </p>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

.verification-destination {
  @apply break-words;
}

.verification-pending {
  @apply mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-surface p-4 text-sm text-warning;
}

.verification-pending-icon {
  @apply mt-0.5 size-5 shrink-0;
}

.verification-pending-body {
  @apply min-w-0 space-y-1;
}

.verification-pending-label {
  @apply font-semibold;
}

.verification-hint {
  @apply text-sm text-text-muted;
}

.verification-status {
  @apply text-sm font-semibold text-text-muted;
}

.verification-error {
  @apply rounded-xl border border-danger/30 bg-danger-surface p-3 text-sm font-semibold text-danger;
}
</style>
