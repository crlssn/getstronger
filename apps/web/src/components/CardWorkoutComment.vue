<script setup lang="ts">
const props = defineProps<{
  imageURL: string
  name: string
  timestamp: Date
  comment: string
}>()

const getRelativeTime = (date: Date): string => {
  const now = new Date()
  const diff = now.getTime() - date.getTime() // Difference in milliseconds

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30) // Approximation for months
  const years = Math.floor(days / 365) // Approximation for years

  if (seconds < 60) {
    return 'just now'
  } else if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  } else if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  } else if (days < 7) {
    return days === 1 ? '1 day ago' : `${days} days ago`
  } else if (weeks < 4) {
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  } else if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`
  } else {
    return years === 1 ? '1 year ago' : `${years} years ago`
  }
}
</script>

<template>
  <img class="h-8 w-8 rounded-full mr-4" :src="props.imageURL" alt="" />
  <div>
    <div class="flex justify-between items-center">
      <p class="font-semibold mr-2">{{ props.name }}</p>
      <span class="text-gray-500 text-sm">{{ getRelativeTime(props.timestamp) }}</span>
    </div>
    <p>{{ props.comment }}</p>
  </div>
</template>
