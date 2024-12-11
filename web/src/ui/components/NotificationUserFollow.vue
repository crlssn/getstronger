<script setup lang="ts">
import type { User } from '@/proto/api/v1/shared_pb.ts'

import { UserPlusIcon } from '@heroicons/vue/24/outline'
import { formatUnixToRelativeDateTime } from '@/utils/datetime.ts'

defineProps<{
  actor?: User
  timestamp: bigint
}>()
</script>

<template>
  <RouterLink :to="`/users/${actor?.id}`" class="flex w-full items-center gap-x-3">
    <UserPlusIcon class="size-8" />
    <div class="w-full">
      <div>
        <span class="font-medium">
          {{ actor?.firstName }}
          {{ actor?.lastName }}
        </span>
        followed you
      </div>
    </div>
    <p class="text-sm text-gray-700 mt-1">
      {{ formatUnixToRelativeDateTime(timestamp) }}
    </p>
  </RouterLink>
</template>

<style scoped></style>
