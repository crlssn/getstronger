<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useNotificationStore } from '@/stores/notifications.ts'
import {
  BellIcon,
  BookOpenIcon,
  HomeIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/vue/24/outline'
import {
  BellIcon as BellSolidIcon,
  BookOpenIcon as BookOpenSolidIcon,
  HomeIcon as HomeSolidIcon,
  RectangleStackIcon as RectangleStackSolidIcon,
  UserIcon as UserSolidIcon,
} from '@heroicons/vue/24/solid'

const route = useRoute()
const notificationStore = useNotificationStore()

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
      class="relative"
    >
      <component
        :is="isActive(item.href) ? item.iconActive : item.icon"
        class="h-6 w-6"
      />
      <span
        v-if="item.href === '/notifications' && notificationStore.unreadCount > 0"
        class="badge"
      >
        {{ notificationStore.unreadCount }}
      </span>
    </RouterLink>
  </nav>
</template>

<style scoped>
nav {
  @apply fixed w-full bottom-0 z-10 h-16 px-8 bg-white border-t-2 border-gray-200;
  @apply lg:hidden flex justify-between items-center;
}

.badge {
  @apply absolute left-3 bottom-2 bg-red-600 rounded-full flex justify-center items-center text-xs font-medium text-white scale-75 w-6 h-6;
}
</style>
