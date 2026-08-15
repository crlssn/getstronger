import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import {
  createPlan,
  deletePlan,
  listPlans,
  pauseActivePlan,
  setActivePlan,
  skipPlanRoutine,
  updatePlan,
} from '@/http/requests'
import type { Plan } from '@/proto/api/v1/routine_service_pb'

export const usePlanStore = defineStore('plans', () => {
  const plans = ref<Plan[]>([])
  const loading = ref(false)
  const activePlan = computed(() => plans.value.find((plan) => plan.active))

  const load = async () => {
    loading.value = true
    try {
      const response = await listPlans()
      if (response) plans.value = response.plans
    } finally {
      loading.value = false
    }
  }

  const create = async (name: string, routineIds: string[]) => {
    const response = await createPlan(name, routineIds)
    if (!response?.plan) return undefined
    plans.value = [response.plan, ...plans.value]
    return response.plan
  }

  const update = async (id: string, name: string, routineIds: string[]) => {
    const response = await updatePlan(id, name, routineIds)
    if (!response?.plan) return undefined
    plans.value = plans.value.map((plan) => (plan.id === id ? response.plan! : plan))
    return response.plan
  }

  const remove = async (id: string) => {
    const response = await deletePlan(id)
    if (!response) return false
    plans.value = plans.value.filter((plan) => plan.id !== id)
    return true
  }

  const activate = async (id: string) => {
    const response = await setActivePlan(id)
    if (!response?.plan) return undefined
    plans.value = plans.value.map((plan) =>
      plan.id === id ? response.plan! : { ...plan, active: false },
    )
    return response.plan
  }

  const pause = async () => {
    const response = await pauseActivePlan()
    if (!response) return false
    plans.value = plans.value.map((plan) => ({ ...plan, active: false }))
    return true
  }

  const skip = async (id: string) => {
    const response = await skipPlanRoutine(id)
    if (!response?.plan) return undefined
    plans.value = plans.value.map((plan) => (plan.id === id ? response.plan! : plan))
    return response.plan
  }

  return { activePlan, activate, create, load, loading, pause, plans, remove, skip, update }
})
