<script setup lang="ts">
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { ref } from 'vue'

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
      :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
      :aria-pressed="passwordVisible"
      @click="passwordVisible = !passwordVisible"
    >
      <EyeSlashIcon v-if="passwordVisible" />
      <EyeIcon v-else />
    </button>
  </div>
</template>

<style scoped>
.password-input {
  @apply relative;
}
.password-toggle {
  @apply absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-slate-400 transition hover:text-indigo-600;
}
.password-toggle svg {
  @apply size-5;
}
</style>
