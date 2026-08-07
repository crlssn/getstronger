import type { GetDashboardResponse, Plan, Routine } from '@/proto/api/v1/routine_service_pb'

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getDashboard } from '@/http/requests'

export const useDashboardStore = defineStore(
  'dashboard',
  () => {
    const preferredRoutineId = ref('')
    const dashboard = ref<GetDashboardResponse>()
    const loading = ref(false)

    const nextRoutine = computed<Routine | undefined>(() => dashboard.value?.nextRoutine)
    const activePlan = computed<Plan | undefined>(() => dashboard.value?.activePlan)

    const load = async () => {
      loading.value = true
      try {
        const response = await getDashboard(preferredRoutineId.value)
        if (!response) return

        dashboard.value = response
        if (
          !response.activePlan &&
          response.nextRoutine?.id &&
          response.nextRoutine.id !== preferredRoutineId.value
        ) {
          preferredRoutineId.value = response.nextRoutine.id
        }
      } finally {
        loading.value = false
      }
    }

    const selectRoutine = async (routineId: string) => {
      preferredRoutineId.value = routineId
      await load()
    }

    return {
      dashboard,
      activePlan,
      load,
      loading,
      nextRoutine,
      preferredRoutineId,
      selectRoutine,
    }
  },
  {
    persist: {
      pick: ['preferredRoutineId'],
    },
  },
)
