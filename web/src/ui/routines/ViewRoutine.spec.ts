// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import { RoutineSchema } from '@/proto/api/v1/routine_service_pb'
import { useAlertStore } from '@/stores/alerts'
import { useConfirmationStore } from '@/stores/confirmation'
import ViewRoutine from '@/ui/routines/ViewRoutine.vue'

const { deleteRoutine, getPreviousWorkoutSets, getRoutine, updateExerciseOrder } = vi.hoisted(
  () => ({
    deleteRoutine: vi.fn(),
    getPreviousWorkoutSets: vi.fn(),
    getRoutine: vi.fn(),
    updateExerciseOrder: vi.fn(),
  }),
)

vi.mock('@/http/requests', () => ({
  deleteRoutine,
  getPreviousWorkoutSets,
  getRoutine,
  updateExerciseOrder,
}))

// Drag reorder is not under test here, and sortablejs wants a real DOM.
vi.mock('@vueuse/integrations/useSortable', () => ({ useSortable: vi.fn() }))

const routine = create(RoutineSchema, { id: 'routine-1', name: 'Push Day' })

describe('ViewRoutine', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    getRoutine.mockResolvedValue({ routine })
    getPreviousWorkoutSets.mockResolvedValue({ exerciseSets: [] })
    deleteRoutine.mockReset()

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: ViewRoutine, path: '/routines/:id' },
        { component: { template: '<div />' }, path: '/routines' },
        { component: { template: '<div />' }, path: '/:pathMatch(.*)*' },
      ],
    })
    await router.push(`/routines/${routine.id}`)
    await router.isReady()
  })

  const deleteViaDialog = async () => {
    const wrapper = mount(ViewRoutine, { global: { plugins: [i18n, router] } })
    await flushPromises()

    await wrapper.get('.danger-zone button').trigger('click')
    useConfirmationStore().accept()
    await flushPromises()
    return wrapper
  }

  test('announces a successful deletion as a success and navigates to the list', async () => {
    deleteRoutine.mockResolvedValue({})

    const wrapper = await deleteViaDialog()

    const alert = useAlertStore().alert
    expect(alert?.type).toBe('success')
    expect(alert?.message).toBe('Routine deleted')
    expect(router.currentRoute.value.path).toBe('/routines')
    wrapper.unmount()
  })

  test('reports a failed deletion and stays on the routine', async () => {
    deleteRoutine.mockResolvedValue(undefined)

    const wrapper = await deleteViaDialog()

    const alert = useAlertStore().alert
    expect(alert?.type).toBe('error')
    expect(alert?.message).toBe('The routine could not be deleted. Try again.')
    expect(router.currentRoute.value.path).toBe(`/routines/${routine.id}`)
    wrapper.unmount()
  })
})
