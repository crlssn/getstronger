<script setup lang="ts">
import {ref} from "vue";

const props = defineProps<{
  open: boolean
}>()

const emits = defineEmits(['close'])
const open = ref(props.open)
const close = () => {
  open.value = false
  emits('close', true)
}
</script>

<template>
  <div
    v-if="open"
    class="z-10 fixed inset-0 bg-black opacity-50"
    @click="close"
  />
</template>

<style scoped>

</style>
