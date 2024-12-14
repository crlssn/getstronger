<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { createExercise } from '@/http/requests'
import AppList from '@/ui/components/AppList.vue'
import AppListItemInput from '@/ui/components/AppListItemInput.vue'
import { type CreateExerciseRequest } from '@/proto/api/v1/exercise_service_pb'
import { useActionButton } from '@/stores/actionButton.ts'
import { CheckIcon } from '@heroicons/vue/24/outline'
import AppButton from '@/ui/components/AppButton.vue'

const router = useRouter()
const alertStore = useAlertStore()
const actionButton = useActionButton()

onMounted(() => {
  actionButton.set({
    icon: CheckIcon,
    action: onSubmit,
  })
})

const req = ref<CreateExerciseRequest>({
  $typeName: 'api.v1.CreateExerciseRequest',
  label: '',
  name: '',
})

const onSubmit = async () => {
  const res = await createExercise(req.value)
  if (!res) return
  alertStore.setSuccess('Exercise created')
  await router.push('/exercises')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h6>Name</h6>
    <AppList>
      <AppListItemInput :model="req.name" type="text" required @update="(n) => (req.name = n)" />
    </AppList>

    <h6>Label</h6>
    <AppList>
      <AppListItemInput
        :model="req.label"
        type="text"
        placeholder="Optional"
        @update="(n) => (req.label = n)"
      />
    </AppList>

    <AppButton text="Create" type="submit" colour="primary"> Save Exercise </AppButton>
  </form>
</template>
