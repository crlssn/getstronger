<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useNavTabs } from '@/stores/navTabs.ts'

const route = useRoute()
const navTabs = useNavTabs()
</script>

<template>
  <nav>
    <div class="container">
      <RouterLink
        v-for="tab in navTabs.tabs"
        :key="tab.name"
        :to="tab.href"
        :class="route.fullPath === tab.href ? 'active' : ''"
      >
        {{ tab.name }}
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
nav {
  @apply bg-white w-full border-b-2 border-gray-200;

  .container {
    @apply flex max-w-4xl mx-auto;
    margin-bottom: -2px;
  }
}

a {
  @apply w-full border-b-2 pb-4 text-center text-xs font-bold uppercase;
  @apply border-b-2 border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700;

  &.active {
    @apply border-indigo-500 text-indigo-600;
  }
}
</style>
