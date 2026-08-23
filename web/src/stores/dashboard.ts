import type { GetDashboardResponse, Plan, Routine } from '@/proto/api/v1/routine_service_pb'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'

import { getDashboard } from '@/http/requests'

interface DashboardState {
  preferredRoutineId: string
  dashboard: GetDashboardResponse | undefined
  loading: boolean
  /** The last load failed, so an absent dashboard is not an empty account. */
  failed: boolean
  load: () => Promise<void>
  selectRoutine: (routineId: string) => Promise<void>
}

export const selectNextRoutine = (state: DashboardState): Routine | undefined =>
  state.dashboard?.nextRoutine

export const selectActivePlan = (state: DashboardState): Plan | undefined =>
  state.dashboard?.activePlan

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      preferredRoutineId: '',
      dashboard: undefined,
      loading: false,
      failed: false,

      load: async () => {
        set({ loading: true })
        try {
          const response = await getDashboard(get().preferredRoutineId)
          if (!response) {
            set({ failed: true })
            return
          }

          set({ dashboard: response, failed: false })
          if (
            !response.activePlan &&
            response.nextRoutine?.id &&
            response.nextRoutine.id !== get().preferredRoutineId
          ) {
            set({ preferredRoutineId: response.nextRoutine.id })
          }
        } finally {
          set({ loading: false })
        }
      },

      selectRoutine: async (routineId) => {
        set({ preferredRoutineId: routineId })
        await get().load()
      },
    }),
    {
      name: 'dashboard',
      storage: migratedStorage(),
      // The response itself is server state; only the choice of routine is
      // worth carrying across a reload.
      partialize: ({ preferredRoutineId }) => ({ preferredRoutineId }),
    },
  ),
)
