<script setup lang="ts">
import {
  BellIcon,
  BookOpenIcon,
  // FolderIcon,
  HomeIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/vue/24/outline'
import {
  BellIcon as BellSolidIcon,
  BookOpenIcon as BookOpenSolidIcon,
  // FolderIcon as FolderSolidIcon,
  HomeIcon as HomeSolidIcon,
  RectangleStackIcon as RectangleStackSolidIcon,
  UserIcon as UserSolidIcon,
} from '@heroicons/vue/24/solid'
import { useRoute } from 'vue-router'

const route = useRoute()

const isActive = (basePath: string) => {
  return route.path.startsWith(basePath)
}

const navigation = [
  { href: '/home', icon: HomeIcon, iconActive: HomeSolidIcon, name: 'Home' },
  {
    href: '/routines',
    icon: RectangleStackIcon,
    iconActive: RectangleStackSolidIcon,
    name: 'Routines',
  },
  { href: '/exercises', icon: BookOpenIcon, iconActive: BookOpenSolidIcon, name: 'Exercises' },
  { href: '/notifications', icon: BellIcon, iconActive: BellSolidIcon, name: 'Notifications' },
  { href: '/profile', icon: UserIcon, iconActive: UserSolidIcon, name: 'Profile' },
]
</script>

<template>
  <nav>
    <RouterLink
      v-for="item in navigation"
      :key="item.href"
      :to="item.href"
    >
      <component
        :is="isActive(item.href) ? item.iconActive : item.icon"
        class="h-6 w-6"
      />
    </RouterLink>
  </nav>
</template>

<style scoped>
nav {
  @apply fixed w-full bottom-0 z-50 h-16 px-8 bg-white border-t-2 border-gray-200;
  @apply lg:hidden flex justify-between items-center;
}
</style>
