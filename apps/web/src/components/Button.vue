<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  type: 'button' | 'submit' | 'link'
  colour: 'primary' | 'green' | 'red' | 'amber'
  to?: string
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
  <RouterLink v-if="props.type === 'link'" :to="props.to as string" :class="computedClasses">
    <slot />
  </RouterLink>
  <button v-else :type="props.type" :class="computedClasses">
    <slot />
  </button>
</template>

<style scoped>
a,
button {
  @apply uppercase w-full border-b-8  rounded-md shadow-sm  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2;
  @apply px-3.5 py-2.5 text-sm font-semibold;
}

a.link {
  @apply block text-center mb-6 py-3;
}

.primary {
  @apply bg-indigo-600 hover:bg-indigo-500 border-b-indigo-800 hover:border-b-indigo-700 focus-visible:outline-indigo-600 text-white;
}

.green {
  @apply bg-green-600 hover:bg-green-500 border-b-green-800 hover:border-b-green-700 focus-visible:outline-green-600 text-white;
}

.red {
  @apply bg-red-600 hover:bg-red-500 border-b-red-800 hover:border-b-red-700 focus-visible:outline-red-600 text-white;
}

.amber {
  @apply bg-amber-600 hover:bg-amber-500 border-b-amber-800 hover:border-b-amber-700 focus-visible:outline-amber-600 text-white;
}
</style>
