<script setup lang="ts"></script>

<template>
  <li>
    <slot />
  </li>
</template>

<style scoped>
li {
  @apply flex justify-between items-center gap-x-6 px-4 py-5 text-sm text-gray-900;
}
</style>
