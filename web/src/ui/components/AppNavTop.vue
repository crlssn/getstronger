<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { type User } from '@/proto/api/v1/shared_pb'
import { searchUsers } from '@/http/requests'
import { usePageTitleStore } from '@/stores/pageTitle'
import { useNotificationStore } from '@/stores/notifications'
import { BellIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton'

const input = ref<HTMLInputElement | null>(null)
const users = ref<User[]>([])
const searchBarOpen = ref(false)

const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()
const notificationStore = useNotificationStore()

const openSearchBar = () => {
  searchBarOpen.value = true
  nextTick(() => input.value?.focus())
}

const closeSearchBar = () => {
  users.value = []
  searchBarOpen.value = false
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
  <header class="top-nav">
    <div class="top-nav-inner">
      <template v-if="searchBarOpen">
        <div class="search-wrap">
          <MagnifyingGlassIcon />
          <input
            ref="input"
            type="search"
            placeholder="Search people"
            aria-label="Search people"
            @input="onSearchUsers"
          />
        </div>
        <button type="button" class="icon-button" aria-label="Close search" @click="closeSearchBar">
          <XMarkIcon />
        </button>
        <div v-if="users.length" class="search-results">
          <RouterLink
            v-for="user in users"
            :key="user.id"
            :to="`/users/${user.id}`"
            @click="closeSearchBar"
          >
            <span class="avatar">{{ user.firstName.charAt(0) }}{{ user.lastName.charAt(0) }}</span>
            <span><strong>{{ user.firstName }} {{ user.lastName }}</strong><small>View profile</small></span>
          </RouterLink>
        </div>
      </template>
      <template v-else>
        <RouterLink to="/home" class="brand" aria-label="GetStronger home">
          <span class="brand-mark"><img src="/favicon.png" alt="" /></span>
          <span class="brand-name">GetStronger</span>
        </RouterLink>
        <p class="page-title">{{ pageTitleStore.pageTitle }}</p>
        <div class="top-actions">
          <RouterLink to="/notifications" class="icon-button notification-button" aria-label="Notifications">
            <BellIcon />
            <span v-if="notificationStore.unreadCount" class="notification-badge">
              {{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}
            </span>
          </RouterLink>
          <ActionButton v-if="actionButton.active" :action="actionButton.action" :icon="actionButton.icon" />
          <button v-else type="button" class="icon-button" aria-label="Search people" @click="openSearchBar">
            <MagnifyingGlassIcon />
          </button>
        </div>
      </template>
    </div>
  </header>
  <div v-if="searchBarOpen" class="search-backdrop" @click="closeSearchBar"></div>
</template>

<style scoped>
.top-nav { @apply sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur; }
.top-nav-inner { @apply relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8; }
.brand { @apply flex min-w-0 items-center gap-2; }
.brand-mark { @apply grid size-10 place-items-center rounded-xl bg-indigo-600; }
.brand-mark img { @apply size-6 brightness-0 invert; }
.brand-name { @apply hidden font-semibold tracking-tight text-slate-950 sm:block; }
.page-title { @apply flex-1 truncate text-center text-sm font-semibold text-slate-900 sm:text-left sm:text-base; }
.top-actions { @apply flex items-center gap-2; }
.icon-button { @apply relative grid size-10 flex-none place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700; }
.icon-button :deep(svg), .icon-button > svg { @apply size-5; }
.notification-badge { @apply absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white; }
.search-wrap { @apply flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3; }
.search-wrap svg { @apply size-5 flex-none text-slate-400; }
.search-wrap input { @apply h-11 w-full border-0 bg-transparent p-0 text-sm text-slate-950 placeholder:text-slate-400 focus:ring-0; }
.search-results { @apply absolute left-4 right-4 top-14 z-50 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:left-auto sm:right-16 sm:w-96; }
.search-results a { @apply grid grid-cols-[auto_1fr] items-center gap-3 p-4 transition hover:bg-slate-50; }
.search-results strong, .search-results small { @apply block; }
.search-results small { @apply mt-0.5 text-sm text-slate-500; }
.avatar { @apply grid size-10 place-items-center rounded-xl bg-indigo-100 text-sm font-semibold text-indigo-700; }
.search-backdrop { @apply fixed inset-0 z-30 bg-slate-950/30; }
</style>
