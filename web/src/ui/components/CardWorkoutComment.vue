<script setup lang="ts">
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { type Timestamp } from '@bufbuild/protobuf/wkt'
import { formatToRelativeDateTime } from '@/utils/datetime.ts'

const props = defineProps<{
  user?: User
  timestamp?: Timestamp
  comment: string
}>()
</script>

<template>
  <div class="mb-2">
    <div class="flex items-center">
      <RouterLink
        :to="`/users/${props.user?.id}`"
        class="font-semibold mr-2"
      >
        {{ props.user?.firstName }} {{ props.user?.lastName }}
      </RouterLink>
      <span class="text-gray-500 text-sm">{{ formatToRelativeDateTime(props.timestamp) }}</span>
    </div>
    <p>{{ props.comment }}</p>
  </div>
</template>
