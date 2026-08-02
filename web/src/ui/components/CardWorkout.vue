<script setup lang="ts">
import type { Workout, WorkoutComment } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'

import { DateTime } from 'luxon'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTextareaAutosize } from '@vueuse/core'
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  FireIcon,
  RectangleStackIcon,
  TrophyIcon,
} from '@heroicons/vue/24/outline'

import { deleteWorkout, postWorkoutComment } from '@/http/requests'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { formatToRelativeDateTime } from '@/utils/datetime'
import CardWorkoutComment from '@/ui/components/CardWorkoutComment.vue'
import CardWorkoutExercise from '@/ui/components/CardWorkoutExercise.vue'
import DropdownButton from '@/ui/components/DropdownButton.vue'

const props = defineProps<{
  compact: boolean
  workout: Workout
}>()

const { input: commentInput, textarea } = useTextareaAutosize()
const authStore = useAuthStore()
const alertStore = useAlertStore()
const router = useRouter()
const workoutDeleted = ref(false)
const postingComment = ref(false)
const comments = ref<WorkoutComment[]>([...props.workout.comments])

const isOwner = computed(() => props.workout.user?.id === authStore.userId)
const userName = computed(
  () => `${props.workout.user?.firstName ?? ''} ${props.workout.user?.lastName ?? ''}`.trim(),
)
const initials = computed(
  () =>
    `${props.workout.user?.firstName.charAt(0) ?? ''}${props.workout.user?.lastName.charAt(0) ?? ''}` ||
    'GS',
)
const setCount = computed(() =>
  props.workout.exerciseSets.reduce((total, exercise) => total + exercise.sets.length, 0),
)
const personalBestCount = computed(() =>
  props.workout.exerciseSets.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.metadata?.personalBest).length,
    0,
  ),
)
const durationMinutes = computed(() => {
  if (!props.workout.startedAt || !props.workout.finishedAt) return 0
  return Math.max(
    1,
    Math.round(
      Number(props.workout.finishedAt.seconds - props.workout.startedAt.seconds) / 60,
    ),
  )
})
const finishedDate = computed(() => {
  if (!props.workout.finishedAt) return ''
  return DateTime.fromSeconds(Number(props.workout.finishedAt.seconds)).toFormat(
    'cccc, d LLLL · HH:mm',
  )
})
const commentLabel = computed(() =>
  comments.value.length === 1 ? '1 comment' : `${comments.value.length} comments`,
)
const formattedVolume = computed(() =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(props.workout.intensity),
)

const dropdownItems: DropdownItem[] = [
  { href: `/workouts/${props.workout.id}/edit`, title: 'Edit workout' },
  { func: () => onDeleteWorkout(), title: 'Delete workout' },
]

const onDeleteWorkout = async () => {
  if (!confirm(`Delete “${props.workout.name}”? This cannot be undone.`)) return

  const response = await deleteWorkout(props.workout.id)
  if (!response) return

  alertStore.setErrorWithoutPageRefresh('Workout deleted')
  workoutDeleted.value = true
  if (!props.compact) await router.push('/home')
}

const postComment = async () => {
  const comment = commentInput.value.trim()
  if (!comment || postingComment.value) return

  postingComment.value = true
  try {
    const response = await postWorkoutComment(props.workout.id, comment)
    if (!response?.comment) return

    comments.value.push(response.comment)
    commentInput.value = ''
  } finally {
    postingComment.value = false
  }
}
</script>

<template>
  <article v-if="!workoutDeleted && compact" class="feed-workout-card">
    <header class="feed-author">
      <RouterLink :to="`/users/${workout.user?.id}`" class="avatar">{{ initials }}</RouterLink>
      <div class="min-w-0 flex-1">
        <RouterLink :to="`/users/${workout.user?.id}`">{{ userName }}</RouterLink>
        <RouterLink :to="`/workouts/${workout.id}`">{{ formatToRelativeDateTime(workout.finishedAt) }}</RouterLink>
      </div>
      <DropdownButton v-if="isOwner" :items="dropdownItems" />
    </header>
    <RouterLink :to="`/workouts/${workout.id}`" class="feed-title">
      <span>{{ workout.name }}</span>
      <small>{{ durationMinutes }} min · {{ setCount }} sets</small>
    </RouterLink>
    <div class="feed-exercises">
      <CardWorkoutExercise
        v-for="exerciseSet in workout.exerciseSets"
        :key="exerciseSet.exercise?.id"
        compact
        :exercise-id="exerciseSet.exercise?.id"
        :label="exerciseSet.exercise?.label"
        :name="exerciseSet.exercise?.name"
        :sets="exerciseSet.sets"
      />
    </div>
    <footer class="feed-stats">
      <RouterLink :to="`/workouts/${workout.id}`"><ChatBubbleLeftRightIcon /> {{ commentLabel }}</RouterLink>
      <span><FireIcon /> {{ formattedVolume }} kg</span>
    </footer>
  </article>

  <div v-else-if="!workoutDeleted" class="workout-detail">
    <section class="summary-card">
      <header class="author-row">
        <RouterLink :to="`/users/${workout.user?.id}`" class="avatar large">{{ initials }}</RouterLink>
        <div class="author-copy">
          <RouterLink :to="`/users/${workout.user?.id}`">{{ userName }}</RouterLink>
          <p><CalendarDaysIcon /> {{ finishedDate }}</p>
        </div>
        <DropdownButton v-if="isOwner" :items="dropdownItems" />
      </header>

      <div class="workout-heading">
        <p class="eyebrow">Completed workout</p>
        <h1>{{ workout.name }}</h1>
        <p>Strong work. Here is the complete breakdown of this session.</p>
      </div>

      <div class="metric-grid">
        <article><span class="metric-icon"><FireIcon /></span><div><small>Total volume</small><strong>{{ formattedVolume }} kg</strong></div></article>
        <article><span class="metric-icon"><ClockIcon /></span><div><small>Duration</small><strong>{{ durationMinutes }} min</strong></div></article>
        <article><span class="metric-icon"><RectangleStackIcon /></span><div><small>Completed</small><strong>{{ setCount }} sets</strong></div></article>
        <article><span class="metric-icon amber"><TrophyIcon /></span><div><small>Personal records</small><strong>{{ personalBestCount }}</strong></div></article>
      </div>
    </section>

    <section class="detail-section">
      <header class="section-heading">
        <div><p class="eyebrow">Session details</p><h2>Exercises</h2></div>
        <span>{{ workout.exerciseSets.length }} {{ workout.exerciseSets.length === 1 ? 'exercise' : 'exercises' }}</span>
      </header>
      <div class="exercise-list">
        <CardWorkoutExercise
          v-for="exerciseSet in workout.exerciseSets"
          :key="exerciseSet.exercise?.id"
          :exercise-id="exerciseSet.exercise?.id"
          :label="exerciseSet.exercise?.label"
          :name="exerciseSet.exercise?.name"
          :sets="exerciseSet.sets"
        />
      </div>
    </section>

    <section v-if="workout.note" class="note-card">
      <p class="eyebrow">Workout note</p>
      <p>{{ workout.note }}</p>
    </section>

    <section class="comments-card">
      <header class="section-heading comments-heading">
        <div><p class="eyebrow">Community</p><h2>Comments</h2></div>
        <span>{{ comments.length }}</span>
      </header>

      <div v-if="comments.length" class="comment-list">
        <CardWorkoutComment
          v-for="comment in comments"
          :key="comment.id"
          :user="comment.user"
          :timestamp="comment.createdAt"
          :comment="comment.comment"
        />
      </div>
      <p v-else class="no-comments">No comments yet. Be the first to encourage this workout.</p>

      <form class="comment-form" @submit.prevent="postComment">
        <label for="workout-comment">Add a comment</label>
        <textarea
          id="workout-comment"
          ref="textarea"
          v-model="commentInput"
          maxlength="500"
          placeholder="Write something encouraging…"
          required
        />
        <div>
          <small>{{ commentInput.trim().length }}/500</small>
          <button type="submit" :disabled="!commentInput.trim() || postingComment">
            {{ postingComment ? 'Posting…' : 'Post comment' }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.workout-detail { @apply mx-auto max-w-4xl space-y-5; }
.summary-card, .detail-section, .note-card, .comments-card, .feed-workout-card { @apply rounded-2xl border border-slate-200 bg-white shadow-sm; }
.summary-card { @apply overflow-hidden; }
.author-row, .feed-author { @apply flex items-center gap-3 border-b border-slate-100 p-4 sm:p-5; }
.avatar { @apply grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-xs font-semibold text-indigo-700; }
.avatar.large { @apply size-12 text-sm; }
.author-copy { @apply min-w-0 flex-1; }
.author-copy > a, .feed-author > div > a:first-child { @apply block truncate text-sm font-semibold text-slate-950 hover:text-indigo-700; }
.author-copy p { @apply mt-1 flex items-center gap-1.5 text-xs text-slate-500; }
.author-copy svg { @apply size-4; }
.workout-heading { @apply bg-gradient-to-br from-indigo-700 to-violet-600 px-5 py-6 text-white sm:px-7 sm:py-8; }
.eyebrow { @apply text-xs font-semibold uppercase tracking-wider text-slate-500; }
.workout-heading .eyebrow { @apply text-indigo-100; }
.workout-heading h1 { @apply mt-1 text-3xl font-semibold tracking-tight; }
.workout-heading > p:last-child { @apply mt-2 text-sm text-indigo-100; }
.metric-grid { @apply grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-4; }
.metric-grid article { @apply flex items-center gap-3 bg-white p-4; }
.metric-icon { @apply grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600; }
.metric-icon.amber { @apply bg-amber-50 text-amber-600; }
.metric-icon svg { @apply size-5; }
.metric-grid small, .metric-grid strong { @apply block; }
.metric-grid small { @apply text-xs text-slate-500; }
.metric-grid strong { @apply mt-0.5 text-sm font-semibold text-slate-950; }
.detail-section, .comments-card { @apply p-4 sm:p-5; }
.section-heading { @apply mb-4 flex items-end justify-between gap-3; }
.section-heading h2 { @apply mt-1 text-xl font-semibold tracking-tight text-slate-950; }
.section-heading > span { @apply rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500; }
.exercise-list { @apply space-y-3; }
.note-card { @apply p-5; }
.note-card > p:last-child { @apply mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700; }
.comment-list { @apply divide-y divide-slate-100; }
.no-comments { @apply rounded-xl bg-slate-50 p-4 text-sm text-slate-500; }
.comment-form { @apply mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3; }
.comment-form label { @apply sr-only; }
.comment-form textarea { @apply min-h-24 w-full resize-none border-0 bg-transparent p-2 text-sm leading-6 placeholder:text-slate-400 focus:ring-0; }
.comment-form > div { @apply flex items-center justify-between gap-3 border-t border-slate-200 pt-3; }
.comment-form small { @apply pl-2 text-xs text-slate-400; }
.comment-form button { @apply inline-flex min-h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300; }
.feed-workout-card { @apply mb-4 overflow-hidden; }
.feed-author { @apply border-b-0; }
.feed-author > div > a:last-child { @apply mt-0.5 block text-xs text-slate-500; }
.feed-title { @apply block border-y border-slate-100 px-4 py-3; }
.feed-title span { @apply block text-lg font-semibold text-slate-950; }
.feed-title small { @apply mt-1 block text-xs text-slate-500; }
.feed-exercises { @apply space-y-2 p-4; }
.feed-stats { @apply flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-600; }
.feed-stats a, .feed-stats span { @apply inline-flex items-center gap-1.5; }
.feed-stats svg { @apply size-4 text-indigo-600; }
@media (max-width: 520px) {
  .metric-grid article { @apply gap-2 p-3; }
  .metric-icon { @apply size-9; }
  .workout-heading { @apply px-5 py-6; }
}
</style>
