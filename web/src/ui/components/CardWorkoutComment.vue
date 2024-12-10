<script setup lang="ts">
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { type Timestamp } from '@bufbuild/protobuf/wkt'
import { formatToRelativeDateTime } from '@/utils/datetime.ts'
import {UserCircleIcon} from "@heroicons/vue/24/solid";

const props = defineProps<{
  comment: string
  timestamp?: Timestamp
  user?: User
}>()
</script>

<template>
  <div class="mb-2">
    <div class="flex items-center">
      <UserCircleIcon class="size-10 text-gray-900"/>
      <RouterLink
        :to="`/users/${props.user?.id}`"
        class="font-semibold text-base mx-2"
      >
        {{ props.user?.firstName }} {{ props.user?.lastName }}
      </RouterLink>
      <span class="text-gray-500 text-sm">
        {{ formatToRelativeDateTime(props.timestamp) }}
      </span>
    </div>
    <p class="ml-12 -mt-1 text-base">{{ props.comment }}</p>
  </div>
</template>
