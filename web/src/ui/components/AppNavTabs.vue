<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useNavTabs } from '@/stores/navTabs.ts'

const route = useRoute()
const navTabs = useNavTabs()
</script>

<template>
  <div class="bg-white">
    <nav class="flex">
      <RouterLink
        v-for="tab in navTabs.tabs"
        :key="tab.name"
        :to="tab.href"
        :class="route.fullPath === tab.href ? 'active' : ''"
      >
        {{ tab.name }}
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
a {
  @apply w-full border-b-2 pb-4 text-center text-xs font-bold uppercase;
  @apply border-b-2 border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700;

  &.active {
    @apply border-indigo-500 text-indigo-600;
  }
}
</style>
