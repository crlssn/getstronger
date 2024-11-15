<script setup lang="ts">
const props = defineProps<{
  text: string
  type?: 'button' | 'submit'
}>()
</script>

<template>
  <button :type="props.type"
          class="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" text="">
    {{ props.text }}
  </button>
</template>
