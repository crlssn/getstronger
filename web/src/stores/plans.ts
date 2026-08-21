import type { Plan } from '@/proto/api/v1/routine_service_pb'

import { create } from 'zustand'

import {
  createPlan,
  deletePlan,
  listPlans,
  pauseActivePlan,
  setActivePlan,
  skipPlanRoutine,
  updatePlan,
} from '@/http/requests'

interface PlanState {
  plans: Plan[]
  loading: boolean
  load: () => Promise<void>
  create: (name: string, routineIds: string[]) => Promise<Plan | undefined>
  update: (id: string, name: string, routineIds: string[]) => Promise<Plan | undefined>
  remove: (id: string) => Promise<boolean>
  activate: (id: string) => Promise<Plan | undefined>
  pause: () => Promise<boolean>
  skip: (id: string) => Promise<Plan | undefined>
}

export const selectActivePlan = (state: PlanState) => state.plans.find((plan) => plan.active)

export const usePlanStore = create<PlanState>()((set, get) => {
  const replace = (id: string, plan: Plan) =>
    set({ plans: get().plans.map((existing) => (existing.id === id ? plan : existing)) })

  return {
    plans: [],
    loading: false,

    load: async () => {
      set({ loading: true })
      try {
        const response = await listPlans()
        if (response) set({ plans: response.plans })
      } finally {
        set({ loading: false })
      }
    },

    create: async (name, routineIds) => {
      const response = await createPlan(name, routineIds)
      if (!response?.plan) return undefined
      set({ plans: [response.plan, ...get().plans] })
      return response.plan
    },

    update: async (id, name, routineIds) => {
      const response = await updatePlan(id, name, routineIds)
      if (!response?.plan) return undefined
      replace(id, response.plan)
      return response.plan
    },

    remove: async (id) => {
      const response = await deletePlan(id)
      if (!response) return false
      set({ plans: get().plans.filter((plan) => plan.id !== id) })
      return true
    },

    // Only one plan is active at a time, so activating one stands the rest
    // down here rather than waiting for the next load.
    activate: async (id) => {
      const response = await setActivePlan(id)
      if (!response?.plan) return undefined
      const activated = response.plan
      set({
        plans: get().plans.map((plan) => (plan.id === id ? activated : { ...plan, active: false })),
      })
      return activated
    },

    pause: async () => {
      const response = await pauseActivePlan()
      if (!response) return false
      set({ plans: get().plans.map((plan) => ({ ...plan, active: false })) })
      return true
    },

    skip: async (id) => {
      const response = await skipPlanRoutine(id)
      if (!response?.plan) return undefined
      replace(id, response.plan)
      return response.plan
    },
  }
})
