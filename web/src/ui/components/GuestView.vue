<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
</script>

<template>
  <nav>
    <div class="container">
      <p><span class="font-semibold">Get</span><span class="font-bold">Stronger</span></p>
    </div>
  </nav>
  <AppAlert fixed />
  <main>
    <RouterView />
  </main>
</template>

<style scoped>
nav {
  @apply fixed w-full top-0 z-10  border-b-2 border-gray-200 bg-white h-16;

  .container {
    @apply flex items-center justify-center max-w-4xl mx-auto px-4 h-16;
    p {
      @apply text-2xl;
    }
  }
}

main {
  @apply flex min-h-full flex-col justify-center px-4 max-w-4xl mx-auto pt-20 pb-8;
}
</style>
