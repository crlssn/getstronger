<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAlertStore } from '@/stores/alerts'
import { createExercise } from '@/http/requests'
import AppButton from '@/ui/components/AppButton.vue'
import { type CreateExerciseRequest } from '@/proto/api/v1/exercise_pb'
import AppList from "@/ui/components/AppList.vue";
import AppListItemInput from "@/ui/components/AppListItemInput.vue";

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
  alertStore.setSuccess('Exercise created')
  await router.push('/exercises')
}
</script>

<template>
  <form @submit.prevent="onSubmit">
    <h6>Name</h6>
    <AppList>
      <AppListItemInput :model="req.name" type="text" @update="n => req.name = n" required/>
    </AppList>

    <h6>Label</h6>
    <AppList>
      <AppListItemInput :model="req.label" type="text" @update="n => req.label = n" placeholder="Optional"/>
    </AppList>

    <AppButton
      text="Create"
      type="submit"
      colour="primary"
      container-class="px-4 pb-4"
    >
      Save Exercise
    </AppButton>
  </form>
</template>
