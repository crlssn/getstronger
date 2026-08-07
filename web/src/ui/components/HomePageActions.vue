<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/vue/24/outline'

import { searchUsers } from '@/http/requests'
import type { User } from '@/proto/api/v1/shared_pb'
const input = ref<HTMLInputElement | null>(null)
const users = ref<User[]>([])
const searchOpen = ref(false)

const openSearch = async () => {
  searchOpen.value = true
  await nextTick()
  input.value?.focus()
}

const closeSearch = () => {
  users.value = []
  searchOpen.value = false
}

const onSearchUsers = async () => {
  const query = input.value?.value.trim() ?? ''
  if (query.length < 3) {
    users.value = []
    return
  }

  const response = await searchUsers(query, new Uint8Array(0))
  if (response) users.value = response.users
}
</script>

<template>
  <div class="home-actions">
    <button type="button" class="icon-button" aria-label="Search people" @click="openSearch">
      <MagnifyingGlassIcon />
    </button>

    <section v-if="searchOpen" class="search-panel" aria-label="Search people">
      <div class="search-field">
        <MagnifyingGlassIcon />
        <input
          ref="input"
          type="search"
          placeholder="Search people"
          aria-label="Search people"
          @input="onSearchUsers"
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
      <p v-else class="search-hint">Type at least 3 characters to find someone.</p>
    </section>
  </div>
  <button
    v-if="searchOpen"
    type="button"
    class="search-backdrop"
    aria-label="Close search"
    @click="closeSearch"
  ></button>
</template>

<style scoped>
.home-actions {
  @apply relative z-40 flex shrink-0 items-center gap-2;
}
.icon-button {
  @apply relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700;
}
.icon-button svg {
  @apply size-5;
}
.search-panel {
  width: min(22rem, calc(100vw - 1.5rem));
  @apply absolute right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl;
}
.search-field {
  @apply flex items-center gap-2 rounded-xl bg-slate-50 px-3;
}
.search-field > svg {
  @apply size-5 shrink-0 text-slate-400;
}
.search-field input {
  @apply h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0;
}
.search-field button {
  @apply grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-200;
}
.search-field button svg {
  @apply size-5;
}
.search-results {
  @apply mt-2 divide-y divide-slate-100;
}
.search-results a {
  @apply grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50;
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
  @apply grid size-10 place-items-center rounded-xl bg-indigo-100 text-sm font-semibold text-indigo-700;
}
.search-hint {
  @apply px-3 py-4 text-sm text-slate-500;
}
.search-backdrop {
  @apply fixed inset-0 z-30 cursor-default bg-slate-950/20;
}
</style>
