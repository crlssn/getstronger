<script setup lang="ts"></script>

<template>
  <ul role="list">
    <slot />
  </ul>
</template>

<style scoped>
ul {
  @apply divide-y divide-gray-100 bg-white;
}
</style>

<!-- border border-gray-200 rounded-md overflow-hidden -->
