<script setup lang="ts">
import type { FunctionalComponent } from 'vue'

const props = defineProps<{
  action: () => void
  icon: FunctionalComponent
}>()

const emits = defineEmits(['onClick'])

const onClick = () => {
  props.action()
  emits('onClick')
}
</script>

<template>
  <component :is="props.icon" class="size-6  cursor-pointer" @click="onClick"/>
</template>

<style scoped>

</style>
