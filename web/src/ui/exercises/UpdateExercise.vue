<script setup lang="ts">
import type {Exercise} from "@/proto/api/v1/shared_pb.ts";

import { onMounted, ref } from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useAlertStore} from "@/stores/alerts.ts";
import AppButton from '@/ui/components/AppButton.vue'
import {getExercise, updateExercise} from "@/http/requests.ts";

const route = useRoute()
const router = useRouter()
const exercise = ref<Exercise>()
const alertStore = useAlertStore()

onMounted(async () => {
  const res = await getExercise(route.params.id as string)
  if (!res) return

  exercise.value = res.exercise
})

async function onUpdateExercise() {
  if (!exercise.value) return

  const res = await updateExercise(exercise.value.id, exercise.value.name, exercise.value.label)
  if (!res) return

  alertStore.setSuccess('Exercise updated')
  await router.push(`/exercises/${exercise.value.id}`)
}
</script>

<template>
  <form
    v-if="exercise"
    class="space-y-6"
    @submit.prevent="onUpdateExercise"
  >
    <div>
      <h6>Name</h6>
      <div class="mt-2">
        <input
          v-model="exercise.name"
          type="text"
          required
        >
      </div>
    </div>

    <div>
      <h6>Label</h6>
      <div class="mt-2">
        <input
          v-model="exercise.label"
          type="text"
          placeholder="Optional"
        >
      </div>
    </div>

    <AppButton
      type="submit"
      colour="primary"
      container-class="px-4 pb-4"
    >
      Update Exercise
    </AppButton>
  </form>
</template>

<style scoped>
input {
  @apply block w-full border-0 bg-white px-4 py-5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600;
}
</style>
