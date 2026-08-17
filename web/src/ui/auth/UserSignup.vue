<script setup lang="ts">
import { ref } from 'vue'
import { brandSignupSubtitle } from '@/brand'
import { signup } from '@/http/requests'
import { RouterLink, useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { type SignupRequest } from '@/proto/api/v1/auth_service_pb.ts'
import { useEmailVerificationStore } from '@/stores/emailVerification.ts'
import AuthPasswordInput from '@/ui/auth/AuthPasswordInput.vue'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

const router = useRouter()
const emailVerificationStore = useEmailVerificationStore()
const req = ref<SignupRequest>({
  $typeName: 'api.v1.SignupRequest',
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  passwordConfirmation: '',
  weightUnit: WeightUnit.KILOGRAMS,
  distanceUnit: DistanceUnit.KILOMETERS,
})

const onSignup = async () => {
  const res = await signup(req.value)
  if (!res) return
  // Signup sends the first verification email, so the resend cooldown starts
  // here rather than on the pending page.
  emailVerificationStore.markSent(req.value.email)
  await router.push({ name: 'verify-email-pending' })
}
</script>

<template>
  <section class="auth-view">
    <header class="auth-intro">
      <p class="auth-eyebrow">{{ $t('auth.startTraining') }}</p>
      <h1>{{ $t('auth.signupTitle') }}</h1>
      <p>{{ brandSignupSubtitle }}</p>
    </header>

    <form class="auth-form" method="POST" @submit.prevent="onSignup">
      <div class="grid gap-5 sm:grid-cols-2">
        <div>
          <label for="firstname" class="auth-label">{{ $t('auth.firstName') }}</label>
          <div class="mt-2">
            <input
              id="firstname"
              v-model="req.firstName"
              name="firstname"
              type="text"
              autocomplete="given-name"
              class="auth-input"
              required
            />
          </div>
        </div>

        <div>
          <label for="lastname" class="auth-label">{{ $t('auth.lastName') }}</label>
          <div class="mt-2">
            <input
              id="lastname"
              v-model="req.lastName"
              name="lastname"
              type="text"
              autocomplete="family-name"
              class="auth-input"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <label for="email" class="auth-label">{{ $t('auth.email') }}</label>
        <div class="mt-2">
          <input
            id="email"
            v-model="req.email"
            name="email"
            type="email"
            autocomplete="email"
            class="auth-input"
            inputmode="email"
            required
          />
        </div>
      </div>

      <fieldset>
        <legend class="auth-label">{{ $t('auth.weightUnit') }}</legend>
        <p class="mt-1 text-sm text-slate-500">{{ $t('auth.weightUnitHelp') }}</p>
        <div class="mt-2 grid grid-cols-2 gap-2" :aria-label="$t('auth.weightUnit')">
          <label
            class="flex min-h-(--size-control-lg) cursor-pointer items-center gap-3 rounded-xl border px-4 transition"
            :class="
              req.weightUnit === WeightUnit.KILOGRAMS
                ? 'border-surface-inverse bg-surface-inverse text-white'
                : 'border-slate-200 bg-white text-slate-700'
            "
          >
            <input
              v-model="req.weightUnit"
              class="sr-only"
              type="radio"
              name="weightUnit"
              :value="WeightUnit.KILOGRAMS"
            />
            <strong>{{ $t('auth.kilograms') }}</strong>
            <span class="ml-auto text-sm opacity-70">kg</span>
          </label>
          <label
            class="flex min-h-(--size-control-lg) cursor-pointer items-center gap-3 rounded-xl border px-4 transition"
            :class="
              req.weightUnit === WeightUnit.POUNDS
                ? 'border-surface-inverse bg-surface-inverse text-white'
                : 'border-slate-200 bg-white text-slate-700'
            "
          >
            <input
              v-model="req.weightUnit"
              class="sr-only"
              type="radio"
              name="weightUnit"
              :value="WeightUnit.POUNDS"
            />
            <strong>{{ $t('auth.pounds') }}</strong>
            <span class="ml-auto text-sm opacity-70">lbs</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="auth-label">{{ $t('auth.distanceUnit') }}</legend>
        <p class="mt-1 text-sm text-slate-500">{{ $t('auth.distanceUnitHelp') }}</p>
        <div class="mt-2 grid grid-cols-2 gap-2" :aria-label="$t('auth.distanceUnit')">
          <label
            class="flex min-h-(--size-control-lg) cursor-pointer items-center gap-3 rounded-xl border px-4 transition"
            :class="
              req.distanceUnit === DistanceUnit.KILOMETERS
                ? 'border-surface-inverse bg-surface-inverse text-white'
                : 'border-slate-200 bg-white text-slate-700'
            "
          >
            <input
              v-model="req.distanceUnit"
              class="sr-only"
              type="radio"
              name="distanceUnit"
              :value="DistanceUnit.KILOMETERS"
            />
            <strong>{{ $t('auth.kilometers') }}</strong>
            <span class="ml-auto text-sm opacity-70">km</span>
          </label>
          <label
            class="flex min-h-(--size-control-lg) cursor-pointer items-center gap-3 rounded-xl border px-4 transition"
            :class="
              req.distanceUnit === DistanceUnit.MILES
                ? 'border-surface-inverse bg-surface-inverse text-white'
                : 'border-slate-200 bg-white text-slate-700'
            "
          >
            <input
              v-model="req.distanceUnit"
              class="sr-only"
              type="radio"
              name="distanceUnit"
              :value="DistanceUnit.MILES"
            />
            <strong>{{ $t('auth.miles') }}</strong>
            <span class="ml-auto text-sm opacity-70">mi</span>
          </label>
        </div>
      </fieldset>

      <div>
        <label for="password" class="auth-label">{{ $t('auth.password') }}</label>
        <div class="mt-2">
          <AuthPasswordInput
            id="password"
            v-model="req.password"
            name="password"
            autocomplete="new-password"
          />
        </div>
      </div>

      <div>
        <label for="passwordConfirmation" class="auth-label">{{
          $t('auth.confirmPassword')
        }}</label>
        <div class="mt-2">
          <AuthPasswordInput
            id="passwordConfirmation"
            v-model="req.passwordConfirmation"
            name="passwordConfirmation"
            autocomplete="new-password"
          />
        </div>
      </div>

      <AppButton type="submit" colour="primary" class="auth-submit">{{
        $t('auth.createAccount')
      }}</AppButton>
    </form>

    <p class="auth-footer">
      {{ $t('auth.alreadyMember') }}
      <RouterLink to="/login" class="auth-link">{{ $t('auth.login') }}</RouterLink>
    </p>
  </section>
</template>
