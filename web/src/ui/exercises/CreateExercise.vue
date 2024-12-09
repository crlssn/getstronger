<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { createExercise } from '@/http/requests'
import AppButton from '@/ui/components/AppButton.vue'
import { type CreateExerciseRequest } from '@/proto/api/v1/exercise_pb'

const router = useRouter()
const alertStore = useAlertStore()

const req = ref<CreateExerciseRequest>({
  $typeName: 'api.v1.CreateExerciseRequest',
  label: '',
  name: '',
})

const onSubmit = async () => {
  const res = await createExercise(req.value)
  if (!res) return
  alertStore.setSuccess(`Exercise created`)
  await router.push('/exercises')
}
</script>

<template>
  <form
    class="space-y-6"
    @submit.prevent="onSubmit"
  >
    <div>
      <label
        for="name"
        class="block text-xs font-semibold text-gray-900 uppercase"
      >Name</label>
      <div class="mt-2">
        <input
          id="name"
          v-model="req.name"
          type="text"
          required
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
        >
      </div>
    </div>

    <div>
      <div>
        <label
          for="label"
          class="block text-xs font-semibold text-gray-900 uppercase"
        >
          Label
        </label>
      </div>
      <div class="mt-2">
        <input
          id="label"
          v-model="req.label"
          type="text"
          placeholder="Optional"
          class="block w-full rounded-md border-0 bg-white px-3 py-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-sm"
        >
      </div>
    </div>

    <AppButton
      text="Create"
      type="submit"
      colour="primary"
      class="mt-6"
    >
      Save Exercise
    </AppButton>
  </form>
</template>
