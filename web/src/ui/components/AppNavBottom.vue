<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useNotificationStore } from '@/stores/notifications.ts'
import {
  BellIcon,
  BoltIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  UserIcon,
} from '@heroicons/vue/24/outline'
import {
  BellIcon as BellIconSolid,
  BoltIcon as BoltIconSolid,
  ClipboardDocumentListIcon as ClipboardDocumentListIconSolid,
  HomeIcon as HomeIconSolid,
  UserIcon as UserIconSolid,
} from '@heroicons/vue/24/solid'

const route = useRoute()
const notificationStore = useNotificationStore()

const isActive = (basePath: string) => {
  return route.path.startsWith(basePath)
}

const navigation = [
  { href: '/home', icon: HomeIcon, iconActive: HomeIconSolid, name: 'Home' },
  { href: '/exercises', icon: BoltIcon, iconActive: BoltIconSolid, name: 'Exercises' },
  {
    href: '/routines',
    icon: ClipboardDocumentListIcon,
    iconActive: ClipboardDocumentListIconSolid,
    name: 'Routines',
  },
  { href: '/notifications', icon: BellIcon, iconActive: BellIconSolid, name: 'Notifications' },
  { href: '/profile', icon: UserIcon, iconActive: UserIconSolid, name: 'Profile' },
]
</script>

<template>
  <nav>
    <div class="container">
      <RouterLink v-for="item in navigation" :key="item.href" :to="item.href" class="relative">
        <component :is="isActive(item.href) ? item.iconActive : item.icon" class="h-6 w-6" />
        <span
          v-if="item.href === '/notifications' && notificationStore.unreadCount > 0"
          class="badge"
        >
          {{ notificationStore.unreadCount }}
        </span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
nav {
  @apply fixed w-full bottom-0 z-10 bg-white border-t-2 border-gray-200;

  .container {
    @apply flex justify-between items-center max-w-4xl h-16 px-8 mx-auto;
  }
}

.badge {
  @apply absolute left-3 bottom-2 bg-red-600 rounded-full flex justify-center items-center text-xs font-medium text-white scale-75 w-6 h-6;
}
</style>
