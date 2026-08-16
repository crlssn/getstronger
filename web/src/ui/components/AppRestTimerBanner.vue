<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { BoltIcon, ClockIcon } from '@heroicons/vue/24/outline'

import { useWorkoutStore } from '@/stores/workout'
import useActiveWorkout from '@/utils/useActiveWorkout'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const workoutStore = useWorkoutStore()
const { savedHref, savedWorkout } = useActiveWorkout()

const now = ref(Date.now())
let timerTick: ReturnType<typeof setInterval> | undefined
let timerExpiryHandledFor: number | undefined

const activeWorkoutId = computed(() => savedWorkout.value?.[0])
const restTimerEndsAtMs = computed(() => {
  const time = Date.parse(savedWorkout.value?.[1].restTimerEndsAt ?? '')
  return Number.isNaN(time) ? undefined : time
})
const restTotalSeconds = computed(() => savedWorkout.value?.[1].restTimerTotalSeconds ?? 0)
const remainingSeconds = computed(() =>
  restTimerEndsAtMs.value
    ? Math.max(0, Math.ceil((restTimerEndsAtMs.value - now.value) / 1000))
    : 0,
)
const isActiveWorkoutRoute = computed(
  () => route.name === 'workout-routine' || route.name === 'quick-workout',
)
const visible = computed(() => remainingSeconds.value > 0 && !isActiveWorkoutRoute.value)
const restLabel = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
    .toString()
    .padStart(2, '0')
  const seconds = (remainingSeconds.value % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
})
const restProgress = computed(() => {
  if (restTotalSeconds.value <= 0) return '0%'
  return `${Math.min(1, remainingSeconds.value / restTotalSeconds.value) * 100}%`
})
const restMinuteHues = [45, 100, 165, 205, 270]
const restHue = computed(
  () =>
    restMinuteHues[Math.min(Math.floor(remainingSeconds.value / 60), restMinuteHues.length - 1)],
)
const restFinalMinute = computed(() => remainingSeconds.value > 0 && remainingSeconds.value < 60)
const restFinalCountdown = computed(
  () => remainingSeconds.value > 0 && remainingSeconds.value <= 10,
)

const updateTimer = () => {
  now.value = Date.now()
  const endsAtMs = restTimerEndsAtMs.value
  if (!endsAtMs) return

  if (remainingSeconds.value > 0 || timerExpiryHandledFor === endsAtMs) return
  timerExpiryHandledFor = endsAtMs

  const workoutId = activeWorkoutId.value
  if (workoutId && restTimerEndsAtMs.value === endsAtMs) {
    const returnToWorkout = !isActiveWorkoutRoute.value
    const workoutHref = savedHref.value
    workoutStore.setRestTimer(workoutId)
    if (returnToWorkout) void router.push(workoutHref)
  }
}

watch(restTimerEndsAtMs, (endsAtMs, previousEndsAtMs) => {
  if (endsAtMs !== previousEndsAtMs) timerExpiryHandledFor = undefined
  updateTimer()
})

onMounted(() => {
  updateTimer()
  timerTick = setInterval(updateTimer, 1000)
})

onUnmounted(() => {
  if (timerTick) clearInterval(timerTick)
})
</script>

<template>
  <section
    v-if="visible"
    class="rest-banner"
    :class="{ bright: restFinalMinute, final: restFinalCountdown }"
    :style="{ '--rest-hue': restHue }"
    :aria-label="`${t('workout.restTimer')}: ${restLabel}`"
  >
    <div class="rest-banner-inner">
      <div class="rest-copy">
        <p><ClockIcon /> {{ t('workout.rest') }}</p>
        <strong aria-hidden="true">{{ restLabel }}</strong>
      </div>
      <RouterLink :to="savedHref"> <BoltIcon /> {{ t('workout.goToWorkout') }} </RouterLink>
      <div class="rest-progress" aria-hidden="true">
        <span :style="{ width: restProgress }"></span>
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference '../../assets/base.css';

@property --rest-hue {
  syntax: '<number>';
  inherits: false;
  initial-value: 160;
}
.rest-banner {
  @apply sticky z-30 text-white shadow-lg;
  /* Below the status-bar scrim in the native WebView; zero in browsers. */
  top: env(safe-area-inset-top);
  background-image: linear-gradient(
    140deg,
    hsl(var(--rest-hue, 165) 95% 21%) 0%,
    hsl(var(--rest-hue, 165) 92% 31%) 58%,
    hsl(calc(var(--rest-hue, 165) - 28) 96% 40%) 100%
  );
  transition: --rest-hue 900ms ease;
}
.rest-banner-inner {
  @apply mx-auto grid w-full max-w-3xl grid-cols-[1fr_auto] items-center gap-3 px-3 py-3 sm:px-5 lg:px-8;
}
.rest-copy p {
  @apply flex items-center gap-1.5 text-eyebrow font-bold uppercase text-white/85;
}
.rest-copy p svg {
  @apply size-3.5;
}
.rest-copy strong {
  @apply mt-0.5 block font-mono text-2xl font-bold leading-none tabular-nums;
}
.rest-banner a {
  @apply inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black/25 px-4 text-sm font-semibold transition hover:bg-black/40;
}
.rest-banner a svg {
  @apply size-5;
}
.rest-progress {
  @apply col-span-2 h-1 overflow-hidden rounded-full bg-white/15;
}
.rest-progress span {
  @apply block h-full rounded-full bg-white transition-[width] duration-1000 ease-linear;
}
.rest-banner.bright {
  background-image: linear-gradient(
    140deg,
    hsl(42 100% 50%) 0%,
    hsl(50 100% 56%) 55%,
    hsl(70 92% 54%) 100%
  );
  @apply text-stone-950;
}
.rest-banner.bright .rest-copy p {
  @apply text-stone-900/70;
}
.rest-banner.bright a {
  @apply bg-black/15 text-stone-950 hover:bg-black/25;
}
.rest-banner.bright .rest-progress {
  @apply bg-black/15;
}
.rest-banner.bright .rest-progress span {
  @apply bg-stone-950;
}
.rest-banner.final {
  animation: rest-pulse 1s ease-in-out infinite;
}
@keyframes rest-pulse {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }
  45% {
    filter: brightness(1.12) saturate(1.25);
  }
}
@media (prefers-reduced-motion: reduce) {
  .rest-banner.final {
    animation: none;
  }
}
</style>
