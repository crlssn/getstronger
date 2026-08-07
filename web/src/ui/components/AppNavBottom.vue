<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
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

const navigation = computed(() => [
  {
    href: '/home',
    icon: HomeIcon,
    iconActive: HomeIconSolid,
    name: 'Home',
    active: route.path === '/home',
  },
  {
    href: '/workout',
    icon: BoltIcon,
    iconActive: BoltIconSolid,
    name: 'Workout',
    active: route.path === '/workout' || route.path.startsWith('/workouts/'),
  },
  {
    href: '/plans',
    icon: RectangleStackIcon,
    iconActive: RectangleStackIconSolid,
    name: 'Training',
    active: route.path.startsWith('/plans') || route.path.startsWith('/routines'),
  },
  {
    href: '/exercises',
    icon: BookOpenIcon,
    iconActive: BookOpenIconSolid,
    name: 'Exercises',
    active: route.path.startsWith('/exercises'),
  },
  {
    href: '/profile',
    icon: UserIcon,
    iconActive: UserIconSolid,
    name: 'Me',
    active: route.path.startsWith('/profile'),
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
        <component :is="item.active ? item.iconActive : item.icon" />
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
.bottom-nav span {
  @apply truncate;
}
@media (min-width: 1024px) {
  .bottom-nav {
    @apply left-1/2 right-auto w-[44rem] -translate-x-1/2 rounded-t-2xl border-x;
  }
}
</style>
