<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";

const props = defineProps<{
  model: string
  type: string
  required?: boolean
  placeholder?: string
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
  <li>
    <input
      v-model="value"
      :type="props.type"
      :required="props.required"
      :placeholder="props.placeholder"
      @change="onChange"
    >
  </li>
</template>

<style scoped>
input {
  @apply block w-full border-0 bg-white px-4 py-5 text-gray-900 focus:ring-0 placeholder:text-gray-400 font-medium;
}
</style>
