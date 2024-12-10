<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";

const props = defineProps<{
  model: string
  type: string
  required: boolean
}>()

const emits = defineEmits(['update'])

const value = ref('')

watch(() => props.model, (newVal) => {
  value.value = newVal
})

onMounted(() => {
  value.value = props.model
})

const onChange = () => {
  emits('update', value.value)
}
</script>

<template>
  <li class="p-4">
    <input
      v-model="value"
      :type="props.type"
      :required="props.required"
      @change="onChange"
    >
  </li>
</template>

<style scoped>
input {
  @apply block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-medium;
}
</style>
