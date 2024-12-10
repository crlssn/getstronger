<script setup lang="ts">
import { type DropdownItem } from '@/types/dropdown.ts'
import { EllipsisVerticalIcon } from '@heroicons/vue/20/solid'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import AppButton from "@/ui/components/AppButton.vue";

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
        class="shadow-2xl fixed right-0 bottom-0 left-0 w-full z-50 origin-top-right rounded-t-2xl overflow-hidden bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
      >
        <div class="py-8 px-8">
          <MenuItem
            v-for="(item, index) in props.items"
            v-slot="{ active }"
            :key="index"
            as="div"
          >
            <AppButton
              v-if="item.href"
              colour="primary"
              type="link"
              :to="item.href"
              :class="[
                active ? 'bg-gray-100 text-gray-900 outline-none' : 'text-gray-700',
                'block px-4 text-sm mb-4',
              ]"
            >
              {{ item.title }}
            </AppButton>
            <AppButton
              v-if="item.func"
              colour="gray"
              type="button"
              :class="[
                active ? 'bg-gray-100 text-gray-900 outline-none' : 'text-gray-700',
                'block px-4 text-sm cursor-pointer',
              ]"
              @click="item.func"
            >{{ item.title }}</AppButton>
          </MenuItem>
        </div>
      </MenuItems>
    </transition>
  </Menu>
</template>
