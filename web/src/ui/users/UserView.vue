<script setup lang="ts">
import { useRoute } from 'vue-router'
import UserProfile from '@/ui/components/UserProfile.vue'

const route = useRoute()
</script>

<template>
  <UserProfile :user-id="route.params.id as string" />
</template>

<style scoped></style>
