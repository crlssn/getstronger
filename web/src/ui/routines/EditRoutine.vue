<script setup lang="ts">
import type { Exercise } from '@/proto/api/v1/shared_pb.ts'

import { onMounted, ref } from 'vue'
import { Switch } from '@headlessui/vue'
import { useRoute, useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import { getRoutine, listExercises, updateRoutine } from '@/http/requests.ts'

const name = ref('')
const exercises = ref(Array<Exercise>())
const exerciseIDs = ref(Array<string>())
const pageToken = ref(new Uint8Array(0))
const route = useRoute()
const router = useRouter()
const alertStore = useAlertStore()

onMounted(async () => {
  await fetchRoutine()
  await fetchExercises()
})

const fetchRoutine = async () => {
  const res = await getRoutine(route.params.id as string)
  if (!res) return

  name.value = res.routine?.name as string
  res.routine?.exercises.forEach((e) => exerciseIDs.value.push(e.id))
}

const fetchExercises = async () => {
  const res = await listExercises(pageToken.value)
  if (!res) return
  exercises.value = [...exercises.value, ...res.exercises]
  if (res.nextPageToken.length > 0) {
    pageToken.value = res.nextPageToken
    // TODO: Implement pagination.
    await fetchExercises()
  }
}

const toggleExercise = (id: string) => {
  if (exerciseIDs.value.includes(id)) {
    exerciseIDs.value = exerciseIDs.value.filter((e) => e !== id)
  } else {
    exerciseIDs.value.push(id)
  }
}

const onSubmit = async () => {
  const res = await updateRoutine(route.params.id as string, name.value, exerciseIDs.value)
  if (!res) return

  alertStore.setSuccess('Routine updated')
  await router.push(`/routines/${route.params.id}`)
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h6>Name</h6>
    <AppList v-if="name">
      <AppListItemInput :model="name" type="text" required @update="(n) => (name = n)" />
    </AppList>

    <h6>Exercises</h6>
    <AppList>
      <AppListItem v-for="exercise in exercises" :key="exercise.id">
        <div class="flex justify-between items-center w-full">
          {{ exercise.name }}
          <Switch
            :class="[
              exerciseIDs.includes(exercise.id) ? 'bg-indigo-600' : 'bg-gray-200',
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2',
            ]"
            @click="toggleExercise(exercise.id)"
          >
            <span
              :class="[
                exerciseIDs.includes(exercise.id) ? 'translate-x-5' : 'translate-x-0',
                'pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              ]"
            />
          </Switch>
        </div>
      </AppListItem>
    </AppList>

    <AppButton type="submit" colour="primary" container-class="px-4 pb-4">
      Update Routine
    </AppButton>
  </form>
</template>
