<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {useRoute, useRouter} from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import {getExercise, updateExercise} from "@/http/requests.ts";
import {useAlertStore} from "@/stores/alerts.ts";

const name = ref('')
const label = ref('')

const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()

onMounted(async () => {
  const res = await getExercise(route.params.id as string)
  if (!res) return

  name.value = res.exercise?.name || ''
  label.value = res.exercise?.label || ''
})

async function onUpdateExercise() {
  const res = await updateExercise(route.params.id as string, name.value, label.value)
  if (!res) return

  alertStore.setSuccess(`Exercise updated`)
  await router.push('/exercises')
}
</script>

<template>
  <form
    class="space-y-6"
    @submit.prevent="onUpdateExercise"
  >
    <div>
      <label
        for="name"
        class="block text-xs font-semibold text-gray-900 uppercase"
      >Name</label>
      <div class="mt-2">
        <input
          id="name"
          v-model="name"
          type="text"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
        >
      </div>
    </div>

    <div>
      <div>
        <label
          for="label"
          class="block text-xs font-semibold text-gray-900 uppercase"
        >
          Label
        </label>
      </div>
      <div class="mt-2">
        <input
          id="label"
          v-model="label"
          type="text"
          placeholder="Optional"
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
        >
      </div>
    </div>

    <AppButton
      type="submit"
      colour="primary"
      class="mt-6"
    >
      Update Exercise
    </AppButton>
  </form>
</template>
