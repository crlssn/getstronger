<script setup lang="ts">
import router from '@/router/router'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { create } from '@bufbuild/protobuf'
import { WorkoutClient } from '@/clients/clients'
import AppList from '@/ui/components/AppList.vue'
import AppButton from '@/ui/components/AppButton.vue'
import { usePageTitleStore } from '@/stores/pageTitle'
import AppListItem from '@/ui/components/AppListItem.vue'
import { formatToCompactDateTime } from '@/utils/datetime'
import AppListItemComments from '@/ui/components/AppListItemComments.vue'
import AppListItemCommentForm from '@/ui/components/AppListItemCommentForm.vue'
import {
  DeleteWorkoutRequestSchema,
  GetWorkoutRequestSchema,
  type Workout,
} from '@/proto/api/v1/workouts_pb'

const route = useRoute()
const workout = ref<Workout>()
const pageTitleStore = usePageTitleStore()

onMounted(async () => {
  await fetchWorkout()
  pageTitleStore.setPageTitle(workout?.value?.name as string)
})

const fetchWorkout = async () => {
  const req = create(GetWorkoutRequestSchema, {
    id: route.params.id as string,
  })
  const res = await WorkoutClient.get(req)
  workout.value = res.workout
}

const deleteWorkout = async () => {
  const req = create(DeleteWorkoutRequestSchema, {
    id: route.params.id as string,
  })
  await WorkoutClient.delete(req)
  await router.push('/workouts')
}
</script>

<template>
  <AppButton
    type="button"
    colour="gray"
    class="mb-6"
  >
    Edit Workout
  </AppButton>
  <AppButton
    type="button"
    colour="red"
    class="mb-6"
    @click="deleteWorkout"
  >
    Delete Workout
  </AppButton>
  <h6>{{ formatToCompactDateTime(workout?.finishedAt) }}</h6>
  <AppList>
    <AppListItem
      v-for="exerciseSet in workout?.exerciseSets"
      :key="exerciseSet.exercise?.id"
    >
      <p class="font-semibold mb-2">
        {{ exerciseSet.exercise?.name }}
      </p>
      <p
        v-for="(set, index) in exerciseSet.sets"
        :key="index"
        class="text-sm mb-1"
      >
        {{ set.reps }} x {{ set.weight }} kg
      </p>
    </AppListItem>
    <AppListItemComments
      v-if="workout?.comments"
      :comments="workout.comments"
    />
    <AppListItemCommentForm
      v-if="workout"
      :workout-id="workout.id"
      @posted="workout.comments.push($event)"
    />
  </AppList>
</template>

<style scoped>
h6 {
  @apply text-xs font-semibold text-gray-600 mb-2 uppercase;
}

li {
  @apply block px-4 py-5;
}
</style>
