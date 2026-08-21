// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'
import { nextTick } from 'vue'

import { i18n } from '@/i18n'
import { RoutineSchema } from '@/proto/api/v1/routine_service_pb'
import { ExerciseSchema, ExerciseSetsSchema, SetSchema } from '@/proto/api/v1/shared_pb'
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
const exercise = create(ExerciseSchema, { id: 'exercise-1', name: 'Bench Press' })

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

  describe('the last-session summary', () => {
    afterEach(() => {
      i18n.global.locale.value = 'en'
    })

    const mountWithSets = async (count: number) => {
      getRoutine.mockResolvedValue({
        routine: create(RoutineSchema, { ...routine, exercises: [exercise] }),
      })
      getPreviousWorkoutSets.mockResolvedValue({
        exerciseSets: [
          create(ExerciseSetsSchema, {
            exercise,
            sets: Array.from({ length: count }, (_, index) =>
              create(SetSchema, { reps: 3, weight: 60 + index * 10 }),
            ),
          }),
        ],
      })

      const wrapper = mount(ViewRoutine, { global: { plugins: [i18n, router] } })
      await flushPromises()
      return wrapper
    }

    test('reads in the reader’s language, not only in English', async () => {
      const wrapper = await mountWithSets(2)
      expect(wrapper.get('.exercise-copy small').text()).toBe('2 sets · last 70 kg · 3')

      i18n.global.locale.value = 'sv'
      await nextTick()

      expect(wrapper.get('.exercise-copy small').text()).toBe('2 set · senast 70 kg · 3')
      wrapper.unmount()
    })

    test('counts one set with the singular the catalogue provides', async () => {
      const wrapper = await mountWithSets(1)
      expect(wrapper.get('.exercise-copy small').text()).toBe('1 set · last 60 kg · 3')
      wrapper.unmount()
    })
  })
})
