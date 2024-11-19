<script setup lang="ts">
const props = defineProps<{
  imageURL: string
  name: string
  timestamp: Date
  comment: string
}>()
</script>

<template>
  <img class="h-8 w-8 rounded-full mr-4" :src="props.imageURL" alt="" />
  <div>
    <div class="flex items-center">
      <p class="font-semibold mr-2">{{ props.name }}</p>
      <span class="text-gray-500 text-sm">{{ props.timestamp }}</span>
    </div>
    <p>{{ props.comment }}</p>
  </div>
</template>
