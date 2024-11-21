<script setup lang="ts">
import { useRoute } from 'vue-router'
import {
  BellIcon,
  BookOpenIcon,
  FolderIcon,
  HomeIcon,
  RectangleStackIcon,
} from '@heroicons/vue/24/outline'

import {
  BellIcon as BellSolidIcon,
  BookOpenIcon as BookOpenSolidIcon,
  FolderIcon as FolderSolidIcon,
  HomeIcon as HomeSolidIcon,
  RectangleStackIcon as RectangleStackSolidIcon,
} from '@heroicons/vue/24/solid'

const route = useRoute()

const isActive = (basePath: string) => {
  return route.path.startsWith(basePath)
}

const navigation = [
  { name: 'Home', href: '/home', icon: HomeIcon, iconActive: HomeSolidIcon },
  {
    name: 'Routines',
    href: '/routines',
    icon: RectangleStackIcon,
    iconActive: RectangleStackSolidIcon,
  },
  { name: 'Exercises', href: '/exercises', icon: BookOpenIcon, iconActive: BookOpenSolidIcon },
  { name: 'Workouts', href: '/workouts', icon: FolderIcon, iconActive: FolderSolidIcon },
  { name: 'Notifications', href: '/notifications', icon: BellIcon, iconActive: BellSolidIcon },
]
</script>

<template>
  <nav>
    <RouterLink v-for="item in navigation" :key="item.href" :to="item.href">
      <component :is="isActive(item.href) ? item.iconActive : item.icon" class="h-6 w-6" />
    </RouterLink>
  </nav>
</template>

<style scoped>
nav {
  @apply fixed w-full bottom-0 z-50 h-16 bg-white border-t-2 border-gray-200;
  @apply lg:hidden flex justify-evenly items-center;
}
</style>
