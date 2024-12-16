<script setup lang="ts">
import { type Exercise } from '@/proto/api/v1/shared_pb.ts'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Switch } from '@headlessui/vue'
import { useAlertStore } from '@/stores/alerts.ts'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import { createRoutine, listExercises } from '@/http/requests.ts'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import usePagination from '@/utils/usePagination.ts'
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const name = ref('')
const exercises = ref(Array<Exercise>())
const exerciseIDs = ref(Array<string>())

const router = useRouter()
const alertStore = useAlertStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  await fetchExercises()
})

const toggleExercise = (id: string) => {
  if (exerciseIDs.value.includes(id)) {
    exerciseIDs.value = exerciseIDs.value.filter((e) => e !== id)
    return
  }

  exerciseIDs.value.push(id)
}

const fetchExercises = async () => {
  const res = await listExercises(pageToken.value)
  if (!res) return

  exercises.value = [...exercises.value, ...res.exercises]
  pageToken.value = resolvePageToken(res.pagination)
}

const onCreateRoutine = async () => {
  const res = await createRoutine(name.value, exerciseIDs.value)
  if (!res) return

  alertStore.setSuccess('Routine created')
  await router.push('/routines')
}
</script>

<template>
  <form @submit.prevent="onCreateRoutine">
    <h6>Name</h6>
    <AppList>
      <AppListItemInput :model="name" type="text" required @update="(n) => (name = n)" />
    </AppList>

    <h6>Exercises</h6>
    <AppList :can-fetch="hasMorePages" @fetch="fetchExercises">
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
      <AppListItem v-if="exercises.length === 0">
        <p class="text-red-600">No exercises found</p>
        <ExclamationTriangleIcon class="size-8 text-red-600" />
      </AppListItem>
    </AppList>

    <AppButton type="submit" colour="primary">Save Routine</AppButton>
  </form>
</template>
