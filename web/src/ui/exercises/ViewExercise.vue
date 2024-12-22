<script setup lang="ts">
import { type Exercise, type Set } from '@/proto/api/v1/shared_pb.ts'
import { onMounted, ref } from 'vue'
import router from '@/router/router'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth.ts'
import { useAlertStore } from '@/stores/alerts'
import AppList from '@/ui/components/AppList.vue'
import ExerciseChart from '@/ui/components/ExerciseChart.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppListItem from '@/ui/components/AppListItem.vue'
import { formatToRelativeDateTime } from '@/utils/datetime.ts'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { deleteExercise, getExercise, listSets } from '@/http/requests'
import { ChevronRightIcon, TrashIcon } from '@heroicons/vue/24/outline'
import usePagination from '@/utils/usePagination'
import AppCard from '@/ui/components/AppCard.vue'
import { TrophyIcon } from '@heroicons/vue/24/solid'

const sets = ref([] as Set[])
const exercise = ref<Exercise>()

const route = useRoute()
const authStore = useAuthStore()
const pageTitle = usePageTitleStore()
const alertStore = useAlertStore()
const { hasMorePages, pageToken, resolvePageToken } = usePagination()

onMounted(async () => {
  const res = await getExercise(route.params.id as string)
  if (!res) return

  exercise.value = res.exercise
  pageTitle.setPageTitle(exercise.value?.name as string)

  await fetchSets()
})

const fetchSets = async () => {
  const res = await listSets([], [route.params.id as string], pageToken.value)
  if (!res) return

  sets.value = [...sets.value, ...res.sets]
  pageToken.value = resolvePageToken(res.pagination)
}

const onDeleteExercise = async () => {
  if (confirm('Are you sure you want to delete this exercise?')) {
    await deleteExercise(route.params.id as string)
    alertStore.setError('Exercise deleted')
    await router.push('/exercises')
  }
}

const downSample = (data: Set[], sampleSize: number): Set[] => {
  const sampled: Set[] = []
  const step = Math.ceil(data.length / sampleSize)

  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i])
  }

  return sampled
}
</script>

<template>
  <div v-if="exercise?.label" class="mb-8">
    <h6>Label</h6>
    <AppList>
      <AppListItem>
        {{ exercise.label }}
      </AppListItem>
    </AppList>
  </div>

  <div v-if="sets.length">
    <h6>Progression</h6>
    <AppCard class="p-2">
      <ExerciseChart :sets="downSample(sets, 50)" />
    </AppCard>
  </div>

  <h6 class="mt-8">Sets</h6>
  <AppList :can-fetch="hasMorePages" @fetch="fetchSets">
    <AppListItem v-if="sets.length === 0"> No sets</AppListItem>
    <AppListItemLink
      v-for="(set, index) in sets"
      :key="index"
      :to="`/workouts/${set.metadata?.workoutId}`"
    >
      <div class="w-full flex flex-col">
        <p>
          {{ set.weight }} kg x {{ set.reps }}
          <TrophyIcon
            v-if="set.metadata?.personalBest"
            class="size-5 text-yellow-500 inline ml-1"
          />
        </p>
        <small class="mt-1">{{ formatToRelativeDateTime(set.metadata?.createdAt) }}</small>
      </div>
      <ChevronRightIcon />
    </AppListItemLink>
  </AppList>

  <div v-if="authStore.userId === exercise?.userId">
    <h6 class="mt-8">Admin</h6>
    <AppList>
      <AppListItemLink :to="`/exercises/${route.params.id}/edit`">
        Update Exercise
        <ChevronRightIcon />
      </AppListItemLink>
      <AppListItem is="danger" class="cursor-pointer" @click="onDeleteExercise">
        Delete Exercise
        <TrashIcon />
      </AppListItem>
    </AppList>
  </div>
</template>
