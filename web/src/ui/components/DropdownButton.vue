<script setup lang="ts">
import { type DropdownItem } from '@/types/dropdown.ts'
import { EllipsisVerticalIcon } from '@heroicons/vue/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'

interface Props {
  items: Array<DropdownItem>
}

const props = defineProps<Props>()
</script>

<template>
  <Menu
    as="div"
    class="relative inline-block text-left"
  >
    <div>
      <MenuButton
        class="flex items-center rounded-full text-gray-400 hover:text-gray-600 focus:outline-none"
      >
        <EllipsisVerticalIcon
          class="h-5 w-5"
        />
      </MenuButton>
    </div>

    <transition
      enter-active-class="transition ease-out duration-100"
      enter-from-class="transform opacity-0 scale-95"
      enter-to-class="transform opacity-100 scale-100"
      leave-active-class="transition ease-in duration-75"
      leave-from-class="transform opacity-100 scale-100"
      leave-to-class="transform opacity-0 scale-95"
    >
      <MenuItems
        class="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
      >
        <div class="py-1">
          <MenuItem
            v-for="(item, index) in props.items"
            v-slot="{ active }"
            :key="index"
            as="div"
          >
            <RouterLink
              v-if="item.href"
              :to="item.href"
              :class="[
                active ? 'bg-gray-100 text-gray-900 outline-none' : 'text-gray-700',
                'block px-4 py-2 text-sm',
              ]"
            >
              {{ item.title }}
            </RouterLink>
            <span
              v-if="item.func"
              :class="[
                active ? 'bg-gray-100 text-gray-900 outline-none' : 'text-gray-700',
                'block px-4 py-2 text-sm cursor-pointer',
              ]"
              @click="item.func"
            >{{ item.title }}</span>
          </MenuItem>
        </div>
      </MenuItems>
    </transition>
  </Menu>
</template>
