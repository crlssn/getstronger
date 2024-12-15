<script setup lang="ts">
import { type User } from '@/proto/api/v1/shared_pb.ts'
import { nextTick, ref } from 'vue'
import { searchUsers } from '@/http/requests.ts'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import { MagnifyingGlassIcon } from '@heroicons/vue/20/solid'
import { XMarkIcon } from '@heroicons/vue/24/outline'
import ActionButton from '@/ui/components/ActionButton.vue'
import { useActionButton } from '@/stores/actionButton.ts'
import { useNavTabs } from '@/stores/navTabs.ts'
import AppNavTabs from '@/ui/components/AppNavTabs.vue'

const input = ref<HTMLInputElement | null>(null)
const users = ref(Array<User>())
const searchBarOpen = ref(false)

const navTabs = useNavTabs()
const actionButton = useActionButton()
const pageTitleStore = usePageTitleStore()

const openSearchBar = () => {
  searchBarOpen.value = true
  nextTick(() => {
    input.value?.focus()
  })
}

const closeSearchBar = () => {
  users.value = []
  searchBarOpen.value = false
}

const onSearchUsers = async () => {
  if (!input.value) return

  if ((input.value.value?.length ?? 0) < 3) {
    users.value = []
    return
  }

  const res = await searchUsers(input.value.value, new Uint8Array(0))
  if (!res) return

  users.value = res.users
}
</script>

<template>
  <nav :class="navTabs.active ? 'border-b-0' : 'border-b-2'">
    <div class="container">
      <template v-if="searchBarOpen">
        <form class="w-full">
          <input
            ref="input"
            type="text"
            class="w-full text-sm border-none focus:ring-0"
            placeholder="Search users"
            @keyup="onSearchUsers"
          />
        </form>
        <ul
          v-if="users.length > 0"
          class="absolute bg-gray-100 border-b-white border-b-2 left-0 right-0 top-16 divide-y divide-white max-w-7xl mx-auto lg:rounded-b-md"
        >
          <li v-for="user in users" :key="user.id" @click="closeSearchBar">
            <RouterLink :to="`/users/${user.id}`" class="block px-5 py-5 text-sm font-medium">
              {{ user.firstName }} {{ user.lastName }}
            </RouterLink>
          </li>
        </ul>
        <XMarkIcon class="w-8 h-6 cursor-pointer" @click="closeSearchBar" />
      </template>
      <template v-else>
        <RouterLink to="/">
          <img class="h-auto w-8" src="/favicon.png" />
        </RouterLink>
        <div class="flex flex-1 gap-x-4 justify-center">
          <p class="uppercase text-sm font-semibold text-gray-900">
            {{ pageTitleStore.pageTitle }}
          </p>
        </div>
        <ActionButton
          v-if="actionButton.active"
          :action="actionButton.action"
          :icon="actionButton.icon"
        />
        <ActionButton v-else :action="openSearchBar" :icon="MagnifyingGlassIcon" />
      </template>
    </div>
    <AppNavTabs />
  </nav>
  <div
    v-if="searchBarOpen"
    class="fixed z-20 top-0 left-0 right-0 bottom-0 bg-black opacity-50"
    @click="closeSearchBar"
  />
</template>

<style scoped>
nav {
  @apply sticky top-0 z-30  border-gray-200 bg-white;

  .container {
    @apply flex items-center justify-between max-w-7xl mx-auto  gap-x-4  px-4 h-16;
  }
}
</style>
