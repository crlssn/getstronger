<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/vue/24/outline'

import { searchUsers } from '@/http/requests'
import type { User } from '@/proto/api/v1/shared_pb'

const searchOpen = defineModel<boolean>('open', { default: false })
const input = ref<HTMLInputElement | null>(null)
const users = ref<User[]>([])
const query = ref('')
const searching = ref(false)
const hasSearched = ref(false)
let searchSequence = 0

const openSearch = async () => {
  searchOpen.value = true
  await nextTick()
  input.value?.focus()
}

const closeSearch = () => {
  searchSequence += 1
  query.value = ''
  users.value = []
  searching.value = false
  hasSearched.value = false
  searchOpen.value = false
}

const onSearchUsers = async () => {
  const searchQuery = query.value.trim()
  const sequence = ++searchSequence
  if (searchQuery.length < 3) {
    users.value = []
    searching.value = false
    hasSearched.value = false
    return
  }

  searching.value = true
  const response = await searchUsers(searchQuery, new Uint8Array(0))
  if (sequence !== searchSequence) return

  users.value = response?.users ?? []
  searching.value = false
  hasSearched.value = true
}
</script>

<template>
  <div class="home-actions" :class="{ searching: searchOpen }">
    <button
      v-if="!searchOpen"
      type="button"
      class="search-trigger"
      aria-label="Search people"
      @click="openSearch"
    >
      <MagnifyingGlassIcon />
    </button>

    <section v-if="searchOpen" class="search-panel" aria-label="Search people">
      <div class="search-field">
        <MagnifyingGlassIcon />
        <input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          @input="onSearchUsers"
          @keydown.esc="closeSearch"
        />
        <button type="button" aria-label="Close search" @click="closeSearch"><XMarkIcon /></button>
      </div>
      <div v-if="users.length" class="search-results">
        <RouterLink
          v-for="user in users"
          :key="user.id"
          :to="`/users/${user.id}`"
          @click="closeSearch"
        >
          <span class="avatar">{{ user.firstName.charAt(0) }}{{ user.lastName.charAt(0) }}</span>
          <span>
            <strong>{{ user.firstName }} {{ user.lastName }}</strong>
            <small>View profile</small>
          </span>
        </RouterLink>
      </div>
      <p v-else-if="searching" class="search-hint" aria-live="polite">Searching…</p>
      <p v-else-if="hasSearched" class="search-hint">No people found.</p>
      <p v-else class="search-hint">Type at least 3 characters to find someone.</p>
    </section>
  </div>
</template>

<style scoped>
.home-actions {
  @apply flex shrink-0 items-center;
}
.home-actions.searching {
  @apply w-full;
}
.search-trigger {
  @apply grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900;
}
.search-trigger svg {
  @apply size-5;
}
.search-panel {
  @apply w-full;
}
.search-field {
  @apply flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 shadow-sm;
}
.search-field > svg {
  @apply size-6 shrink-0 text-slate-500;
}
.search-field input {
  @apply h-14 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-slate-950 placeholder:text-slate-400 focus:ring-0;
}
.search-field button {
  @apply grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-200;
}
.search-field button svg {
  @apply size-5;
}
.search-results {
  @apply mt-3 w-full divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm;
}
.search-results a {
  @apply grid w-full grid-cols-[auto_1fr] items-center gap-3 p-4 transition hover:bg-stone-50;
}
.search-results strong,
.search-results small {
  @apply block;
}
.search-results strong {
  @apply text-sm text-slate-900;
}
.search-results small {
  @apply mt-0.5 text-xs text-slate-500;
}
.avatar {
  @apply grid size-11 place-items-center rounded-xl bg-stone-200 text-sm font-semibold text-stone-800;
}
.search-hint {
  @apply px-1 py-4 text-sm text-slate-500;
}
</style>
