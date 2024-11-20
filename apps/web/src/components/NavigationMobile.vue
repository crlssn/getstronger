<script setup lang="ts">
import { type FunctionalComponent } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  items: Array<{
    name: string
    href: string
    icon: FunctionalComponent
  }>
}>()

const route = useRoute()

const isActive = (basePath: string) => {
  return route.path.startsWith(basePath)
}

const iconClass = (isActive: boolean) => {
  return isActive ? 'text-indigo-500' : 'text-gray-500'
}
</script>

<template>
  <nav>
    <RouterLink v-for="item in props.items" :key="item.href" :to="item.href">
      <component :is="item.icon" class="h-6 w-6" :class="iconClass(isActive(item.href))" />
    </RouterLink>
  </nav>
</template>

<style scoped>
nav {
  @apply fixed w-full bottom-0 z-50 h-16 bg-white border-t-2 border-gray-200;
  @apply lg:hidden flex justify-evenly items-center;
}
</style>
