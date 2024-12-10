<script setup lang="ts">
import type { PaginationRequest, User } from '@/proto/api/v1/shared_pb.ts'

import { create } from '@bufbuild/protobuf'
import { computed, nextTick, ref } from 'vue'
import { UserClient } from '@/http/clients.ts'
import { RouterView, useRoute } from 'vue-router'
import AppAlert from '@/ui/components/AppAlert.vue'
import { usePageTitleStore } from '@/stores/pageTitle.ts'
import { MagnifyingGlassIcon } from '@heroicons/vue/20/solid'
import { SearchRequestSchema } from '@/proto/api/v1/users_pb.ts'
import NavigationMobile from '@/ui/components/NavigationMobile.vue'
import { Dialog, DialogPanel, TransitionChild, TransitionRoot } from '@headlessui/vue'
import {
  ArrowPathRoundedSquareIcon,
  BellIcon,
  BookOpenIcon,
  HomeIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'

const navigation = [
  { href: '/home', icon: HomeIcon, name: 'Home' },
  { href: '/routines', icon: ArrowPathRoundedSquareIcon, name: 'Routines' },
  { href: '/exercises', icon: BookOpenIcon, name: 'Exercises' },
  { href: '/notifications', icon: BellIcon, name: 'Notifications' },
  { href: '/profile', icon: UserIcon, name: 'Profile' },
]

const sidebarOpen = ref(false)
const searchBarOpen = ref(false)
const input = ref<HTMLInputElement | null>(null)
const route = useRoute()
const users = ref(Array<User>())

const isActive = (basePath: string) => computed(() => route.path.startsWith(basePath))

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

const searchUsers = async () => {
  if ((input.value?.value?.length ?? 0) < 3) {
    users.value = []
    return
  }

  const req = create(SearchRequestSchema, {
    pagination: {
      pageLimit: 5,
    } as PaginationRequest,
    query: input.value?.value,
  })
  const res = await UserClient.search(req)
  users.value = res.users
}
</script>

<template>
  <div class="pb-12">
    <TransitionRoot
      as="template"
      :show="sidebarOpen"
    >
      <Dialog
        class="relative z-50 lg:hidden"
        @close="sidebarOpen = false"
      >
        <TransitionChild
          as="template"
          enter="transition-opacity ease-linear duration-300"
          enter-from="opacity-0"
          enter-to="opacity-100"
          leave="transition-opacity ease-linear duration-300"
          leave-from="opacity-100"
          leave-to="opacity-0"
        >
          <div class="fixed inset-0 bg-gray-900/80" />
        </TransitionChild>

        <div class="fixed inset-0 flex">
          <TransitionChild
            as="template"
            enter="transition ease-in-out duration-300 transform"
            enter-from="-translate-x-full"
            enter-to="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leave-from="translate-x-0"
            leave-to="-translate-x-full"
          >
            <DialogPanel class="relative mr-16 flex w-full max-w-xs flex-1">
              <TransitionChild
                as="template"
                enter="ease-in-out duration-300"
                enter-from="opacity-0"
                enter-to="opacity-100"
                leave="ease-in-out duration-300"
                leave-from="opacity-100"
                leave-to="opacity-0"
              >
                <div class="absolute left-full top-0 flex w-16 justify-center pt-5">
                  <button
                    type="button"
                    class="-m-2.5 p-2.5"
                    @click="sidebarOpen = false"
                  >
                    <XMarkIcon
                      class="h-6 w-6 text-white"
                    />
                  </button>
                </div>
              </TransitionChild>
              <div class="flex grow flex-col gap-y-5 overflow-y-auto bg-indigo-600 px-6 pb-4">
                <div class="flex h-16 shrink-0 items-center">
                  <img
                    class="h-8 w-auto"
                    src="https://tailwindui.com/plus/img/logos/mark.svg?color=white"
                    alt="Your Company"
                  >
                </div>
                <nav class="flex flex-1 flex-col">
                  <ul
                    role="list"
                    class="flex flex-1 flex-col gap-y-7"
                  >
                    <li>
                      <ul
                        role="list"
                        class="-mx-2 space-y-1"
                      >
                        <li
                          v-for="item in navigation"
                          :key="item.name"
                        >
                          <RouterLink
                            :to="item.href"
                            :class="[
                              isActive(item.href).value
                                ? 'bg-indigo-700 text-white'
                                : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                              'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                            ]"
                            @click="sidebarOpen = false"
                          >
                            <component
                              :is="item.icon"
                              :class="[
                                isActive(item.href).value
                                  ? 'text-white'
                                  : 'text-indigo-200 group-hover:text-white',
                                'h-6 w-6 shrink-0',
                              ]"
                            />
                            {{ item.name }}
                          </RouterLink>
                        </li>
                      </ul>
                    </li>
                  </ul>
                </nav>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </TransitionRoot>

    <!-- Static sidebar for desktop -->
    <div class="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
      <!-- Sidebar component, swap this element with another sidebar if you like -->
      <div class="flex grow flex-col gap-y-5 overflow-y-auto bg-indigo-600 px-6 pb-4">
        <div class="flex h-16 shrink-0 items-center">
          <img
            class="h-8 w-auto"
            src="https://tailwindui.com/plus/img/logos/mark.svg?color=white"
            alt="Your Company"
          >
          <span class="ml-2 font-bold text-white">GetStronger</span>
        </div>
        <nav class="flex flex-1 flex-col">
          <ul
            role="list"
            class="flex flex-1 flex-col gap-y-7"
          >
            <li>
              <ul
                role="list"
                class="-mx-2 space-y-1"
              >
                <li
                  v-for="item in navigation"
                  :key="item.name"
                >
                  <RouterLink
                    :to="item.href"
                    :class="[
                      isActive(item.href).value
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-700 hover:text-white',
                      'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold',
                    ]"
                  >
                    <component
                      :is="item.icon"
                      :class="[
                        isActive(item.href).value
                          ? 'text-white'
                          : 'text-indigo-200 group-hover:text-white',
                        'h-6 w-6 shrink-0',
                      ]"
                    />
                    {{ item.name }}
                  </RouterLink>
                </li>
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    </div>

    <div class="lg:pl-72">
      <div
        class="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 border-b-2 border-gray-200 bg-white px-4 sm:gap-x-6 sm:px-6 lg:px-8"
      >
        <form
          v-if="searchBarOpen"
          class="w-full"
        >
          <input
            ref="input"
            type="text"
            class="w-full text-sm border-none focus:ring-0"
            placeholder="Search users"
            @keyup="searchUsers"
          >
        </form>
        <ul
          v-if="searchBarOpen && users.length > 0"
          class="absolute bg-gray-100 border-b-white border-b-2 left-0 right-0 top-16 divide-y divide-white"
        >
          <li
            v-for="user in users"
            :key="user.id"
            @click="closeSearchBar"
          >
            <RouterLink
              :to="`/users/${user.id}`"
              class="block px-5 py-5 text-sm font-medium"
            >
              {{ user.firstName }} {{ user.lastName }}
            </RouterLink>
          </li>
        </ul>
        <img
          v-if="!searchBarOpen"
          class="h-auto w-8 lg:hidden"
          src="https://tailwindui.com/plus/img/logos/mark.svg"
        >
        <div
          v-if="!searchBarOpen"
          class="flex flex-1 gap-x-4 justify-center"
        >
          <p class="uppercase text-sm font-semibold text-gray-900 lg:hidden">
            {{ pageTitleStore.pageTitle }}
          </p>
        </div>
        <XMarkIcon
          v-if="searchBarOpen"
          class="w-8 h-6 cursor-pointer"
          @click="closeSearchBar"
        />
        <MagnifyingGlassIcon
          v-else
          class="w-8 h-6 cursor-pointer"
          @click="openSearchBar"
        />
      </div>

      <AppAlert />

      <main class="mx-auto max-w-7xl bg-gray-100 py-4">
        <RouterView />
      </main>
    </div>
  </div>

  <div
    v-if="searchBarOpen"
    class="fixed z-10 top-0 left-0 right-0 bottom-0 bg-black opacity-50"
    @click="closeSearchBar"
  />
  <NavigationMobile v-else />
</template>
