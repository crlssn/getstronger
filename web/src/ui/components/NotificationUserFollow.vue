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
      <i18n-t keypath="notifications.followedYou" tag="div" scope="global">
        <template #name>
          <span class="font-semibold">{{ actor?.name }}</span>
        </template>
      </i18n-t>
      <p class="text-sm text-text-subtle">
        {{ formatUnixToRelativeDateTime(timestamp) }}
      </p>
    </div>
  </RouterLink>
</template>

<style scoped></style>
