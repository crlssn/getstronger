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
@reference '../../assets/base.css';

nav {
  @apply bg-white w-full border-b-2 border-border;

  .container {
    @apply flex max-w-4xl mx-auto lg:px-2;
    margin-bottom: -2px;
  }
}

a {
  @apply w-full border-b-2 pb-4 text-center text-xs font-bold uppercase;
  @apply border-b-2 border-border text-text-subtle hover:text-text-muted;

  &.active {
    @apply border-ink-muted text-ink;
  }
}
</style>
