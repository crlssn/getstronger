<script setup lang="ts">
import AppListItem from '@/ui/components/AppListItem.vue'
import AppList from '@/ui/components/AppList.vue'
import { onMounted, ref } from 'vue'
import type { PersonalBest } from '@/proto/api/v1/exercise_service_pb.ts'
import { getPersonalBests } from '@/http/requests.ts'
import { useRoute } from 'vue-router'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import AppListItemLink from '@/ui/components/AppListItemLink.vue'
import { formatToRelativeDateTime, formatUnixToRelativeDateTime } from '@/utils/datetime.ts'

const props = defineProps<{
  id: string
  pageTitle: string
}>()

const route = useRoute()
const pageTitleStore = usePageTitleStore()
const personalBests = ref([] as PersonalBest[])

onMounted(async () => {
  await fetchPersonalBests()
  pageTitleStore.setPageTitle(props.pageTitle)
})

const fetchPersonalBests = async () => {
  const res = await getPersonalBests(route.params.id as string)
  if (!res) return

  personalBests.value = res.personalBests
}
</script>

<template>
  <AppList>
    <AppListItemLink
      v-for="pb in personalBests"
      :key="pb.exercise?.id"
      :to="`/exercises/${pb.exercise?.id}`"
    >
      <div class="font-semibold">
        {{ pb.exercise?.name }}
        <small v-if="pb.exercise?.label">
          {{ pb.exercise.label }}
        </small>
        <p class="text-sm text-gray-700 mt-1 font-normal">
          {{ formatToRelativeDateTime(pb.set?.metadata?.createdAt) }}
        </p>
      </div>
      {{ pb.set?.weight }} kg x {{ pb.set?.reps }}
    </AppListItemLink>
  </AppList>
</template>

<style scoped></style>
