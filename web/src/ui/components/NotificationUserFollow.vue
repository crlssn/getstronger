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
    <UserPlusIcon class="size-7" />
    <div class="w-full">
      <div>
        <span class="font-semibold">
          {{ actor?.firstName }}
          {{ actor?.lastName }}
        </span>
        followed you
      </div>
      <p class="text-sm text-gray-500">
        {{ formatUnixToRelativeDateTime(timestamp) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
