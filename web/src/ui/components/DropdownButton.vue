<script setup lang="ts">
import type { DropdownItem } from '@/types/dropdown'
import { EllipsisHorizontalIcon } from '@heroicons/vue/24/outline'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'

withDefaults(defineProps<{ items: DropdownItem[]; label?: string }>(), {
  label: 'Workout actions',
})
</script>

<template>
  <Menu as="div" class="relative inline-block text-left">
    <MenuButton class="menu-trigger" :aria-label="label">
      <EllipsisHorizontalIcon />
    </MenuButton>
    <transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="scale-95 opacity-0"
      enter-to-class="scale-100 opacity-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="scale-100 opacity-100"
      leave-to-class="scale-95 opacity-0"
    >
      <MenuItems class="menu-items">
        <MenuItem v-for="item in items" :key="item.title" v-slot="{ active }">
          <RouterLink v-if="item.href" :to="item.href" class="menu-item" :class="{ active }">
            {{ item.title }}
          </RouterLink>
          <button
            v-else
            type="button"
            class="menu-item danger"
            :class="{ active }"
            @click="item.func"
          >
            {{ item.title }}
          </button>
        </MenuItem>
      </MenuItems>
    </transition>
  </Menu>
</template>

<style scoped>
@reference '../../assets/base.css';

.menu-trigger {
  @apply grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-ink-border hover:bg-ink-surface hover:text-ink-strong;
}
.menu-trigger svg {
  @apply size-5;
}
.menu-items {
  @apply absolute right-0 z-50 mt-2 w-48 origin-top-right space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl focus:outline-none;
}
.menu-item {
  @apply flex min-h-(--size-control-sm) w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700;
}
.menu-item.active {
  @apply bg-slate-50;
}
.menu-item.danger {
  @apply text-red-600;
}
.menu-item.danger.active {
  @apply bg-red-50;
}
</style>
