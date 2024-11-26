<script setup lang="ts">
import { type Timestamp } from '@bufbuild/protobuf/wkt'
import { formatToRelativeDateTime } from '@/utils/datetime.ts'

const props = defineProps<{
  name?: string
  timestamp?: Timestamp
  comment: string
}>()
</script>

<template>
  <div class="mb-2">
    <div class="flex items-center">
      <RouterLink :to="`/users/${}`" class="font-semibold mr-2">{{ props.name }}</RouterLink>
      <span class="text-gray-500 text-sm">{{ formatToRelativeDateTime(props.timestamp) }}</span>
    </div>
    <p>{{ props.comment }}</p>
  </div>
</template>
