<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNotificationStore } from '@/stores/notifications'
import {
  BoltIcon,
  BookOpenIcon,
  HomeIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/vue/24/outline'
import {
  BoltIcon as BoltIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  HomeIcon as HomeIconSolid,
  RectangleStackIcon as RectangleStackIconSolid,
  UserIcon as UserIconSolid,
} from '@heroicons/vue/24/solid'

const route = useRoute()
const notificationStore = useNotificationStore()

const navigation = computed(() => [
  {
    href: '/home',
    icon: HomeIcon,
    iconActive: HomeIconSolid,
    name: 'Home',
    active: route.path === '/home',
    badge: 0,
  },
  {
    href: '/workout',
    icon: BoltIcon,
    iconActive: BoltIconSolid,
    name: 'Workout',
    active: route.path === '/workout' || route.path.startsWith('/workouts/'),
    badge: 0,
  },
  {
    href: '/plans',
    icon: RectangleStackIcon,
    iconActive: RectangleStackIconSolid,
    name: 'Training',
    active: route.path.startsWith('/plans') || route.path.startsWith('/routines'),
    badge: 0,
  },
  {
    href: '/exercises',
    icon: BookOpenIcon,
    iconActive: BookOpenIconSolid,
    name: 'Exercises',
    active: route.path.startsWith('/exercises'),
    badge: 0,
  },
  {
    href: '/profile',
    icon: UserIcon,
    iconActive: UserIconSolid,
    name: 'Me',
    active: route.path.startsWith('/profile') || route.path.startsWith('/notifications'),
    badge: notificationStore.unreadCount,
  },
])
</script>

<template>
  <nav class="bottom-nav" aria-label="Primary navigation">
    <div class="bottom-nav-inner">
      <RouterLink
        v-for="item in navigation"
        :key="item.name"
        :to="item.href"
        :class="{ active: item.active }"
        :aria-current="item.active ? 'page' : undefined"
      >
        <span class="nav-icon">
          <component :is="item.active ? item.iconActive : item.icon" />
          <span v-if="item.badge" class="notification-badge">
            {{ item.badge > 99 ? '99+' : item.badge }}
          </span>
        </span>
        <span>{{ item.name }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.bottom-nav {
  @apply fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white;
}
.bottom-nav-inner {
  min-height: calc(4.5rem + env(safe-area-inset-bottom));
  @apply mx-auto grid max-w-3xl grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)];
}
.bottom-nav a {
  @apply grid min-w-0 place-items-center content-center gap-1 rounded-xl px-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-indigo-700;
}
.bottom-nav a.active {
  @apply text-indigo-700;
}
.bottom-nav svg {
  @apply size-6;
}
.nav-icon {
  @apply relative grid place-items-center;
}
.notification-badge {
  @apply absolute -right-3 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-600 px-1 text-[0.625rem] font-bold leading-none text-white;
}
.bottom-nav span {
  @apply truncate;
}
@media (min-width: 1024px) {
  .bottom-nav {
    @apply left-1/2 right-auto w-[44rem] -translate-x-1/2 rounded-t-2xl border-x;
  }
}
</style>
