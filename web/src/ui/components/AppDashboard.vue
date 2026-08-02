<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import AppNavBottom from '@/ui/components/AppNavBottom.vue'
import AppNavTop from '@/ui/components/AppNavTop.vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const focusedWorkout = computed(() => route.name === 'workout-routine')
</script>

<template>
  <div :class="focusedWorkout ? 'pb-0' : 'pb-20'">
    <AppNavTop />
    <AppAlert />
    <main>
      <RouterView />
    </main>
    <AppNavBottom v-if="!focusedWorkout" />
  </div>
</template>

<style scoped>
main {
  @apply mx-auto w-full max-w-6xl px-3 py-5 sm:px-5 lg:px-8 lg:py-8;
}
</style>
