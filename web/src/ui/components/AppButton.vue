<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  colour: 'amber' | 'gray' | 'green' | 'primary' | 'red'
  containerClass?: string
  to?: string
  type: 'button' | 'link' | 'submit'
}>()

const computedClasses = computed(() => {
  let linkClass
  if (props.type === 'link') {
    linkClass = `link`
  }

  return `${linkClass} ${props.colour}`
})
</script>

<template>
  <div :class="containerClass" class="lg:px-0">
    <RouterLink v-if="props.type === 'link'" :to="props.to as string" :class="computedClasses">
      <slot />
    </RouterLink>
    <button v-else :type="props.type" :class="computedClasses">
      <slot />
    </button>
  </div>
</template>

<style scoped>
a,
button {
  @apply uppercase w-full border-b-8 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2;
  @apply py-3 text-sm font-semibold;
}

.link {
  @apply block text-center py-3;
}

.primary {
  @apply bg-indigo-600 border-b-indigo-800  focus-visible:outline-indigo-600 text-white;
}

.green {
  @apply bg-green-600 border-b-green-800 focus-visible:outline-green-600 text-white;
}

.red {
  @apply bg-red-600  border-b-red-800 focus-visible:outline-red-600 text-white;
}

.amber {
  @apply bg-amber-600 border-b-amber-800  focus-visible:outline-amber-600 text-white;
}

.gray {
  @apply bg-gray-200 border-b-0 py-4 focus-visible:outline-gray-500 text-gray-500;
}
</style>
