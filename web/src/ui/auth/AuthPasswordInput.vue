<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    autocomplete?: string
    id: string
    name: string
  }>(),
  {
    autocomplete: 'current-password',
  },
)

const model = defineModel<string>({ required: true })
const { t } = useI18n()
const passwordVisible = ref(false)
</script>

<template>
  <div class="password-input">
    <input
      :id="id"
      v-model="model"
      :name="name"
      :type="passwordVisible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      class="auth-input pr-12"
      required
    />
    <button
      type="button"
      class="password-toggle"
      :aria-label="passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')"
      :aria-pressed="passwordVisible"
      @click="passwordVisible = !passwordVisible"
    >
      <EyeSlashIcon v-if="passwordVisible" />
      <EyeIcon v-else />
    </button>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.password-input {
  @apply relative;
}
.password-toggle {
  @apply absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-control text-text-subtle transition hover:text-ink;
}
.password-toggle svg {
  @apply size-5;
}
</style>
