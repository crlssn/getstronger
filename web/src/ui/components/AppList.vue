<script setup lang="ts"></script>

<template>
  <ul role="list">
    <slot />
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white border-t border-b border-gray-200 mb-4;
}
</style>
