<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useNotificationStore } from '@/stores/notifications'
import useActiveWorkout from '@/utils/useActiveWorkout'
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
const { t } = useI18n()
const notificationStore = useNotificationStore()
const { savedHref, savedRestTimerEndsAtMs, savedWorkout, savedWorkoutStartedAtMs } =
  useActiveWorkout()

const now = ref(Date.now())
let timerTick: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  timerTick = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timerTick) clearInterval(timerTick)
})

const activeWorkoutTimer = computed(() => {
  if (savedRestTimerEndsAtMs.value && savedRestTimerEndsAtMs.value > now.value) {
    const remainingSeconds = Math.max(
      0,
      Math.ceil((savedRestTimerEndsAtMs.value - now.value) / 1000),
    )
    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = remainingSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (!savedWorkoutStartedAtMs.value) return ''
  const totalSeconds = Math.max(0, Math.floor((now.value - savedWorkoutStartedAtMs.value) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
})

const navigation = computed(() => [
  {
    href: '/home',
    icon: HomeIcon,
    iconActive: HomeIconSolid,
    name: t('nav.home'),
    active: route.path === '/home',
    badge: 0,
    timer: '',
  },
  {
    href: savedWorkout.value ? savedHref.value : '/workout',
    icon: BoltIcon,
    iconActive: BoltIconSolid,
    name: t('nav.workout'),
    active: route.path === '/workout' || route.path.startsWith('/workouts/'),
    badge: 0,
    timer:
      route.path === '/workout' || route.path.startsWith('/workouts/')
        ? ''
        : activeWorkoutTimer.value,
  },
  {
    href: '/plans',
    icon: RectangleStackIcon,
    iconActive: RectangleStackIconSolid,
    name: t('nav.training'),
    active: route.path.startsWith('/plans') || route.path.startsWith('/routines'),
    badge: 0,
    timer: '',
  },
  {
    href: '/exercises',
    icon: BookOpenIcon,
    iconActive: BookOpenIconSolid,
    name: t('nav.exercises'),
    active: route.path.startsWith('/exercises'),
    badge: 0,
    timer: '',
  },
  {
    href: '/profile',
    icon: UserIcon,
    iconActive: UserIconSolid,
    name: t('nav.me'),
    active: route.path.startsWith('/profile') || route.path.startsWith('/notifications'),
    badge: notificationStore.unreadCount,
    timer: '',
  },
])

const isActiveWorkout = computed(
  () => route.name === 'workout-routine' || route.name === 'quick-workout',
)
</script>

<template>
  <nav
    class="bottom-nav"
    :class="{ 'joined-to-workout-actions': isActiveWorkout }"
    :aria-label="$t('nav.primary')"
  >
    <div class="bottom-nav-inner">
      <RouterLink
        v-for="item in navigation"
        :key="item.name"
        :to="item.href"
        :class="{ active: item.active }"
        :aria-current="item.active ? 'page' : undefined"
        :aria-label="item.timer ? item.name : undefined"
      >
        <span class="nav-icon">
          <component :is="item.active ? item.iconActive : item.icon" />
          <span v-if="item.badge && !item.active" class="notification-badge">
            {{ item.badge > 99 ? '99+' : item.badge }}
          </span>
        </span>
        <!-- The link keeps its name via aria-label; the ticking duration is
             decorative so it does not re-announce every second. -->
        <span v-if="item.timer" class="timer-badge" aria-hidden="true">
          {{ item.timer }}
        </span>
        <span v-else class="nav-label">{{ item.name }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
@reference '../../assets/base.css';

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
.bottom-nav.joined-to-workout-actions {
  /* The action dock's outer shadow otherwise washes over this surface and
     makes two identical white backgrounds look like different colours. */
  @apply z-40;
}
.bottom-nav svg {
  @apply size-6;
}
.nav-icon {
  @apply relative grid place-items-center;
}
.notification-badge {
  @apply absolute -right-3 -top-2 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-red-600 px-1 text-[0.6875rem] font-bold leading-none text-white ring-[3px] ring-white;
}
.timer-badge {
  @apply whitespace-nowrap rounded-full bg-stone-900 px-2 py-0.5 font-mono text-[0.65rem] font-semibold leading-none text-white;
}
.nav-label {
  @apply truncate;
}
@media (min-width: 1024px) {
  .bottom-nav {
    @apply left-1/2 right-auto w-[48rem] -translate-x-1/2 rounded-t-2xl border-x;
  }
  /* Active-workout actions sit immediately above the navigation. Removing the
     two facing corners makes both regions read as a single anchored control
     dock, while the divider preserves their separate meanings. */
  .bottom-nav.joined-to-workout-actions {
    @apply rounded-t-none;
  }
}
</style>
