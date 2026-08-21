<script setup lang="ts">
import type { Workout, WorkoutComment } from '@/proto/api/v1/workout_service_pb'
import type { DropdownItem } from '@/types/dropdown'

import { DateTime } from 'luxon'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useTextareaAutosize } from '@vueuse/core'
import {
  CalendarDaysIcon,
  ClockIcon,
  FireIcon,
  RectangleStackIcon,
  TrophyIcon,
} from '@heroicons/vue/24/outline'

import { deleteWorkout, postWorkoutComment } from '@/http/requests'
import { dateLocale } from '@/i18n'
import { formatNumber } from '@/utils/numbers'
import { handle, initials } from '@/utils/names'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import CardWorkoutComment from '@/ui/components/CardWorkoutComment.vue'
import CardWorkoutExercise from '@/ui/components/CardWorkoutExercise.vue'
import DropdownButton from '@/ui/components/DropdownButton.vue'

const props = defineProps<{
  compact: boolean
  workout: Workout
}>()

const { t } = useI18n()
const { input: commentInput, textarea } = useTextareaAutosize()
const authStore = useAuthStore()
const alertStore = useAlertStore()
const confirmationStore = useConfirmationStore()
const router = useRouter()
const workoutDeleted = ref(false)
const postingComment = ref(false)
const comments = ref<WorkoutComment[]>([...props.workout.comments])

const isOwner = computed(() => props.workout.user?.id === authStore.userId)
const userName = computed(() => props.workout.user?.name ?? '')
const userHandle = computed(() => handle(props.workout.user?.username))
const userInitials = computed(() => initials(props.workout.user?.name) || 'GS')
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
    Math.round(Number(props.workout.finishedAt.seconds - props.workout.startedAt.seconds) / 60),
  )
})
const finishedDate = computed(() => {
  if (!props.workout.finishedAt) return ''
  return DateTime.fromSeconds(Number(props.workout.finishedAt.seconds))
    .setLocale(dateLocale)
    .toFormat('cccc, d LLLL · HH:mm')
})
const showComments = computed(() => !isOwner.value || comments.value.length > 0)
const formattedVolume = computed(() => formatNumber(props.workout.intensity))

const dropdownItems: DropdownItem[] = [
  { href: `/workouts/${props.workout.id}/edit`, title: t('workout.card.editWorkout') },
  { func: () => onDeleteWorkout(), title: t('workout.card.deleteWorkout') },
]

const onDeleteWorkout = async () => {
  const confirmed = await confirmationStore.confirm({
    body: t('workout.card.deleteConfirmBody'),
    confirmLabel: t('workout.card.deleteWorkout'),
    destructive: true,
    title: t('workout.card.deleteConfirmTitle', { name: props.workout.name }),
  })
  if (!confirmed) return

  const response = await deleteWorkout(props.workout.id)
  if (!response) return

  // The feed card stays put, but the full view navigates home, so its alert
  // must survive that one route change.
  if (props.compact) alertStore.setSuccessWithoutPageRefresh(t('workout.card.deleted'))
  else alertStore.setSuccess(t('workout.card.deleted'))
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
  <article
    v-if="!workoutDeleted && compact"
    class="summary-card feed-summary-card"
    :class="{ 'feed-summary-card--personal-best': personalBestCount > 0 }"
  >
    <RouterLink
      :to="`/workouts/${workout.id}`"
      class="feed-card-link"
      :aria-label="t('workout.card.viewDetails', { name: workout.name })"
    />

    <header class="author-row feed-card-control">
      <RouterLink :to="`/users/${workout.user?.id}`" class="avatar large">{{
        userInitials
      }}</RouterLink>
      <div class="author-copy">
        <RouterLink :to="`/users/${workout.user?.id}`">{{ userHandle }}</RouterLink>
        <p>
          <span class="truncate">{{ userName }}</span>
          <span aria-hidden="true">·</span>
          <CalendarDaysIcon /> {{ finishedDate }}
        </p>
      </div>
      <DropdownButton v-if="isOwner" :items="dropdownItems" />
    </header>

    <div class="workout-heading">
      <div class="workout-heading-copy">
        <div>
          <p class="eyebrow">{{ t('workout.completed') }}</p>
          <h2>{{ workout.name }}</h2>
        </div>
        <span v-if="personalBestCount > 0" class="personal-best-badge">
          <TrophyIcon />
          {{ t('workout.card.prBadge', personalBestCount) }}
        </span>
      </div>
    </div>

    <div class="metric-grid">
      <article>
        <span class="metric-icon"><FireIcon /></span>
        <div>
          <small>{{ t('workout.totalVolume') }}</small
          ><strong>{{ formattedVolume }} {{ t('common.kg') }}</strong>
        </div>
      </article>
      <article>
        <span class="metric-icon"><ClockIcon /></span>
        <div>
          <small>{{ t('common.duration') }}</small
          ><strong>{{ durationMinutes }} {{ t('common.min') }}</strong>
        </div>
      </article>
      <article>
        <span class="metric-icon"><RectangleStackIcon /></span>
        <div>
          <small>{{ t('workout.setsLogged') }}</small
          ><strong>{{ setCount }}</strong>
        </div>
      </article>
      <article>
        <span class="metric-icon" :class="{ amber: personalBestCount > 0 }"><TrophyIcon /></span>
        <div>
          <small>{{ t('workout.personalRecords') }}</small
          ><strong>{{ personalBestCount }}</strong>
        </div>
      </article>
    </div>

    <div v-if="workout.note" class="summary-note summary-note--compact">
      <p class="eyebrow">{{ t('workout.note') }}</p>
      <p>{{ workout.note }}</p>
    </div>
  </article>

  <div v-else-if="!workoutDeleted" class="workout-detail">
    <section
      class="summary-card detail-summary-card"
      :class="{ 'detail-summary-card--personal-best': personalBestCount > 0 }"
    >
      <header class="author-row">
        <RouterLink :to="`/users/${workout.user?.id}`" class="avatar large">{{
          userInitials
        }}</RouterLink>
        <div class="author-copy">
          <RouterLink :to="`/users/${workout.user?.id}`">{{ userHandle }}</RouterLink>
          <p>
            <span class="truncate">{{ userName }}</span>
            <span aria-hidden="true">·</span>
            <CalendarDaysIcon /> {{ finishedDate }}
          </p>
        </div>
        <DropdownButton v-if="isOwner" :items="dropdownItems" />
      </header>

      <div class="workout-heading">
        <div class="workout-heading-copy">
          <!-- The nav bar above already carries this workout's name. The
               eyebrow stays because it says what the title does not. -->
          <p class="eyebrow">{{ t('workout.completed') }}</p>
          <span v-if="personalBestCount > 0" class="personal-best-badge">
            <TrophyIcon />
            {{ t('workout.card.prBadge', personalBestCount) }}
          </span>
        </div>
      </div>

      <div class="metric-grid">
        <article>
          <span class="metric-icon"><FireIcon /></span>
          <div>
            <small>{{ t('workout.totalVolume') }}</small
            ><strong>{{ formattedVolume }} {{ t('common.kg') }}</strong>
          </div>
        </article>
        <article>
          <span class="metric-icon"><ClockIcon /></span>
          <div>
            <small>{{ t('common.duration') }}</small
            ><strong>{{ durationMinutes }} {{ t('common.min') }}</strong>
          </div>
        </article>
        <article>
          <span class="metric-icon"><RectangleStackIcon /></span>
          <div>
            <small>{{ t('workout.setsLogged') }}</small
            ><strong>{{ setCount }}</strong>
          </div>
        </article>
        <article>
          <span class="metric-icon" :class="{ amber: personalBestCount > 0 }"><TrophyIcon /></span>
          <div>
            <small>{{ t('workout.personalRecords') }}</small
            ><strong>{{ personalBestCount }}</strong>
          </div>
        </article>
      </div>

      <div v-if="workout.note" class="summary-note">
        <p class="eyebrow">{{ t('workout.note') }}</p>
        <p>{{ workout.note }}</p>
      </div>
    </section>

    <section class="detail-section">
      <header class="section-heading">
        <div>
          <p class="eyebrow">{{ t('workout.sessionDetails') }}</p>
          <h2>{{ t('common.exercises') }}</h2>
        </div>
        <span>{{ t('home.exerciseCount', workout.exerciseSets.length) }}</span>
      </header>
      <div class="exercise-list">
        <CardWorkoutExercise
          v-for="exerciseSet in workout.exerciseSets"
          :key="exerciseSet.exercise?.id"
          flat
          :exercise-id="exerciseSet.exercise?.id"
          :name="exerciseSet.exercise?.name"
          :sets="exerciseSet.sets"
          :tags="exerciseSet.exercise?.tags"
          :metrics="exerciseSet.exercise?.metrics"
        />
      </div>
    </section>

    <section v-if="showComments" class="comments-card">
      <header class="section-heading comments-heading">
        <div>
          <p class="eyebrow">{{ t('workout.card.community') }}</p>
          <h2>{{ t('workout.card.comments') }}</h2>
        </div>
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
      <p v-else class="no-comments">{{ t('workout.card.noComments') }}</p>

      <form class="comment-form" @submit.prevent="postComment">
        <label for="workout-comment">{{ t('workout.card.addComment') }}</label>
        <textarea
          id="workout-comment"
          ref="textarea"
          v-model="commentInput"
          maxlength="500"
          :placeholder="t('workout.card.commentPlaceholder')"
          required
        />
        <div>
          <small>{{ commentInput.trim().length }}/500</small>
          <button type="submit" :disabled="!commentInput.trim() || postingComment">
            {{ postingComment ? t('workout.card.posting') : t('workout.card.postComment') }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
@reference '../../assets/base.css';

.workout-detail {
  @apply mx-auto max-w-4xl space-y-5;
}
.summary-card,
.detail-section,
.comments-card {
  @apply card;
}
.summary-card {
  @apply overflow-hidden;
}
.author-row,
.feed-author {
  @apply flex items-center gap-3 border-b border-border p-4 sm:p-5;
}
.avatar {
  @apply grid size-11 shrink-0 place-items-center rounded-control bg-ink-tint text-xs font-semibold text-ink-strong;
}
.avatar.large {
  @apply size-12 text-sm;
}
.author-copy {
  @apply min-w-0 flex-1;
}
/* A name in a card is a link, and the type size is right. What it lacked was
   somewhere for a thumb to land, so it gains a hit area rather than a font. */
.author-copy > a,
.feed-author > div > a:first-child {
  @apply -my-3 block truncate py-3 text-sm font-semibold text-text hover:text-ink-strong;
}
.author-copy p {
  @apply mt-1 flex items-center gap-1.5 text-xs text-text-subtle;
}
.author-copy svg {
  @apply size-4;
}
.workout-heading {
  @apply bg-surface-inverse px-5 py-6 text-white sm:px-6;
}
.eyebrow {
  @apply text-eyebrow font-bold uppercase text-text-subtle;
}
.workout-heading .eyebrow {
  @apply text-ink-tint;
}
.workout-heading h2 {
  @apply mt-1 text-title font-semibold;
}
.metric-grid {
  @apply grid grid-cols-2 gap-px bg-ink-tint sm:grid-cols-4;
}
.metric-grid article {
  @apply flex items-center gap-3 bg-white p-4;
}
.metric-icon {
  @apply grid size-10 shrink-0 place-items-center rounded-control bg-ink-tint text-ink-strong;
}
.metric-icon.amber {
  @apply bg-record-surface text-record;
}
.metric-icon svg {
  @apply size-5;
}
.metric-grid small,
.metric-grid strong {
  @apply block;
}
.metric-grid small {
  @apply text-xs text-text-subtle;
}
.metric-grid strong {
  @apply mt-0.5 text-sm font-semibold text-text;
}
.detail-section,
.comments-card {
  @apply p-4 sm:p-5;
}
.section-heading {
  @apply mb-4 flex items-end justify-between gap-3;
}
.section-heading h2 {
  @apply mt-1 text-title font-semibold text-text;
}
.section-heading > span {
  @apply rounded-full bg-info-surface px-2.5 py-1 text-xs font-semibold text-text-muted;
}
.exercise-list {
  @apply divide-y divide-border;
}
.summary-note {
  @apply border-t border-border bg-white px-5 py-4 sm:px-6;
}
.summary-note > p:last-child {
  @apply mt-2 whitespace-pre-wrap text-sm leading-6 text-text-muted;
}
.summary-note--compact > p:last-child {
  @apply line-clamp-2;
}
.comment-list {
  @apply divide-y divide-border;
}
.no-comments {
  @apply rounded-control bg-ink-surface p-4 text-sm text-text-subtle;
}
.comment-form {
  @apply mt-5 rounded-card border border-border bg-ink-surface p-3;
}
.comment-form label {
  @apply sr-only;
}
.comment-form textarea {
  @apply min-h-24 w-full resize-none border-0 bg-transparent p-2 text-sm leading-6 placeholder:text-text-subtle focus:ring-0;
}
.comment-form > div {
  @apply flex items-center justify-between gap-3 border-t border-border pt-3;
}
.comment-form small {
  @apply pl-2 text-xs text-text-subtle;
}
.comment-form button {
  @apply inline-flex min-h-(--size-control) items-center rounded-control bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-strong disabled:cursor-not-allowed disabled:bg-ink-border;
}
.feed-summary-card {
  @apply relative mb-4 overflow-hidden transition hover:-translate-y-0.5 hover:border-ink-border hover:shadow-raised;
}
.feed-summary-card .workout-heading {
  @apply border-y border-border bg-ink-surface text-text;
  background-image: none;
  box-shadow: inset 4px 0 0 var(--color-ink-muted);
}
.feed-summary-card--personal-best {
  @apply border-record-border shadow-raised;
}
.detail-summary-card--personal-best {
  @apply border-record-border shadow-raised;
}
.feed-summary-card--personal-best .workout-heading {
  @apply border-record-border bg-record-surface;
  box-shadow: inset 4px 0 0 var(--color-record);
}
.detail-summary-card--personal-best .workout-heading {
  @apply border-y border-record-border bg-record-surface text-text;
  background-image: none;
  box-shadow: inset 4px 0 0 var(--color-record);
}
.feed-summary-card .workout-heading .eyebrow {
  @apply text-ink;
}
.feed-summary-card--personal-best .workout-heading .eyebrow {
  @apply text-record-strong;
}
.detail-summary-card--personal-best .workout-heading .eyebrow {
  @apply text-record-strong;
}
.workout-heading-copy {
  @apply flex items-start justify-between gap-4;
}
.personal-best-badge {
  @apply inline-flex shrink-0 items-center gap-1.5 rounded-full border border-record-strong bg-record px-2.5 py-1 text-xs font-semibold text-white shadow-card;
}
.personal-best-badge svg {
  @apply size-4;
}
.feed-summary-card--personal-best .metric-icon.amber,
.detail-summary-card--personal-best .metric-icon.amber {
  @apply bg-record-surface text-record-strong;
}
.feed-card-link {
  @apply absolute inset-0 z-10 rounded-card;
}
.feed-card-control {
  @apply pointer-events-none relative z-20;
}
.feed-card-control :deep(a),
.feed-card-control :deep(button) {
  @apply pointer-events-auto;
}
@media (max-width: 520px) {
  .metric-grid article {
    @apply gap-2 p-3;
  }
  .metric-icon {
    @apply size-9;
  }
  .workout-heading {
    @apply px-5 py-6;
  }
}
</style>
