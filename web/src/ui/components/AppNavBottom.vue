<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  BoltIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  HomeIcon,
  UserIcon,
} from '@heroicons/vue/24/outline'
import {
  BoltIcon as BoltIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  ClipboardDocumentListIcon as ClipboardDocumentListIconSolid,
  HomeIcon as HomeIconSolid,
  UserIcon as UserIconSolid,
} from '@heroicons/vue/24/solid'

import { useDashboardStore } from '@/stores/dashboard'

const route = useRoute()
const dashboardStore = useDashboardStore()

onMounted(async () => {
  if (!dashboardStore.dashboard) await dashboardStore.load()
})

const trainHref = computed(() =>
  dashboardStore.preferredRoutineId
    ? `/workouts/routine/${dashboardStore.preferredRoutineId}`
    : '/routines',
)

const navigation = computed(() => [
  { href: '/home', icon: HomeIcon, iconActive: HomeIconSolid, name: 'Home', active: route.path === '/home' },
  { href: trainHref.value, icon: BoltIcon, iconActive: BoltIconSolid, name: 'Train', active: route.path.startsWith('/workouts/routine') },
  { href: '/routines', icon: ClipboardDocumentListIcon, iconActive: ClipboardDocumentListIconSolid, name: 'Routines', active: route.path.startsWith('/routines') },
  { href: '/progress', icon: ChartBarIcon, iconActive: ChartBarIconSolid, name: 'Progress', active: route.path.startsWith('/progress') || route.path.startsWith('/exercises/') },
  { href: '/profile', icon: UserIcon, iconActive: UserIconSolid, name: 'Me', active: route.path.startsWith('/profile') },
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
.bottom-nav { @apply fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur; }
.bottom-nav-inner { @apply mx-auto grid h-[4.5rem] max-w-3xl grid-cols-5 px-2 pb-[env(safe-area-inset-bottom)]; }
.bottom-nav a { @apply grid min-w-0 place-items-center content-center gap-1 rounded-xl px-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-indigo-700; }
.bottom-nav a.active { @apply text-indigo-700; }
.bottom-nav svg { @apply size-6; }
.bottom-nav span { @apply truncate; }
@media (min-width: 1024px) {
  .bottom-nav { @apply left-1/2 right-auto w-[44rem] -translate-x-1/2 rounded-t-2xl border-x; }
}
</style>
