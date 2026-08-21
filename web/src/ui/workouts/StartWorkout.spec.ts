// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import {
  DistanceUnit,
  ExerciseMetric,
  ExerciseSchema,
  ExerciseSetsSchema,
  WeightUnit,
} from '@/proto/api/v1/shared_pb'
import { ConnectError } from '@connectrpc/connect'
import { RoutineSchema } from '@/proto/api/v1/routine_service_pb'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { useWorkoutStore } from '@/stores/workout'
import StartWorkout from '@/ui/workouts/StartWorkout.vue'

const {
  createWorkout,
  getCurrentUser,
  getDashboard,
  getExercise,
  getPreviousWorkoutSets,
  getRoutine,
  listExercises,
  routerPush,
  routerReplace,
} = vi.hoisted(() => ({
  createWorkout: vi.fn(),
  getCurrentUser: vi.fn(),
  getDashboard: vi.fn(),
  getExercise: vi.fn(),
  getPreviousWorkoutSets: vi.fn(),
  getRoutine: vi.fn(),
  listExercises: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
}))

vi.mock('@/http/requests', () => ({
  createWorkout,
  getCurrentUser,
  getDashboard,
  getExercise,
  getPreviousWorkoutSets,
  getRoutine,
  listExercises,
}))

vi.mock('@/router/router', () => ({
  default: { push: routerPush, replace: routerReplace },
}))

vi.mock('@/http/clients', () => ({
  workoutClient: { createWorkout: vi.fn() },
}))

const routineID = 'routine-1'
const benchPress = create(ExerciseSchema, {
  id: 'exercise-bench',
  name: 'Bench Press',
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  restSeconds: 90,
})
const squat = create(ExerciseSchema, {
  id: 'exercise-squat',
  name: 'Squat',
  metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  restSeconds: 0,
})

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'workout', path: '/workout' },
      {
        component: StartWorkout,
        name: 'workout-routine',
        path: '/workouts/routine/:routine_id',
      },
      { component: StartWorkout, name: 'quick-workout', path: '/workouts/quick' },
      { component: { template: '<div />' }, name: 'view-workout', path: '/workouts/:id' },
    ],
  })

const mountWorkout = async (path = `/workouts/routine/${routineID}`) => {
  const router = createTestRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(StartWorkout, {
    global: { plugins: [i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const logFirstSet = async (wrapper: Awaited<ReturnType<typeof mountWorkout>>) => {
  await wrapper.get('input[aria-label="Bench Press set 1 weight"]').setValue('80')
  await wrapper.get('input[aria-label="Bench Press set 1 reps"]').setValue('8')
}

describe('StartWorkout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-16T12:00:00Z'))
    vi.stubGlobal('scrollTo', vi.fn())
    window.scrollTo = vi.fn()

    getCurrentUser.mockResolvedValue({ user: { weightUnit: WeightUnit.KILOGRAMS } })
    getRoutine.mockResolvedValue({
      routine: create(RoutineSchema, { name: 'Push Day', exercises: [benchPress, squat] }),
    })
    getPreviousWorkoutSets.mockResolvedValue({ exerciseSets: [] })
    getExercise.mockImplementation(async (id: string) => ({
      exercise: [benchPress, squat].find((exercise) => exercise.id === id),
    }))
    listExercises.mockResolvedValue({ exercises: [], pagination: {} })
    createWorkout.mockReset()
    createWorkout.mockResolvedValue({ workoutId: 'workout-1' })
    getDashboard.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('header', () => {
    test('renders the session as a single compact line', async () => {
      const wrapper = await mountWorkout()

      const header = wrapper.get('.workout-header')
      expect(header.get('h1').text()).toBe('Push Day')
      expect(header.find('.eyebrow').exists()).toBe(false)
      // Where you are, and how long you have been here. Nothing else.
      expect(header.get('.session-progress').text()).toBe('Exercise 1 of 2')
      expect(header.get('.elapsed').text().length).toBeGreaterThan(0)
      expect(header.find('.session-rail').exists()).toBe(true)
      wrapper.unmount()
    })

    test('advances the rail as exercises are completed', async () => {
      const wrapper = await mountWorkout()

      const rail = () => wrapper.get('.workout-header .session-rail span')
      expect(rail().attributes('style')).toContain('width: 0%')

      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      expect(rail().attributes('style')).toContain('width: 50%')
      wrapper.unmount()
    })
  })

  describe('rest timer banner', () => {
    const restBanner = (wrapper: Awaited<ReturnType<typeof mountWorkout>>) =>
      wrapper.find('.rest-banner[aria-label="Rest timer"]')

    test('bands the top of the session once a set with a rest time completes', async () => {
      const wrapper = await mountWorkout()

      expect(restBanner(wrapper).exists()).toBe(false)
      await logFirstSet(wrapper)

      const banner = restBanner(wrapper)
      expect(banner.exists()).toBe(true)
      expect(banner.get('strong').text()).toBe('01:30')
      expect(wrapper.get('.workout-shell').classes()).toContain('resting')
      wrapper.unmount()
    })

    test('extends by thirty seconds and skips', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      await wrapper.get('.rest-banner button:first-of-type').trigger('click')
      expect(restBanner(wrapper).get('strong').text()).toBe('02:00')
      const extended = Date.parse(workoutStore.getRestTimer(routineID).endsAt ?? '')
      expect(extended - Date.now()).toBe(120_000)

      await wrapper.get('.rest-banner button:last-of-type').trigger('click')
      expect(restBanner(wrapper).exists()).toBe(false)
      expect(workoutStore.getRestTimer(routineID).endsAt).toBeUndefined()
      expect(wrapper.get('.workout-shell').classes()).not.toContain('resting')
      wrapper.unmount()
    })

    test('restores a persisted timer on mount', async () => {
      const workoutStore = useWorkoutStore()
      workoutStore.initialiseWorkout(routineID)
      const endsAt = new Date(Date.now() + 45_000).toISOString()
      workoutStore.setRestTimer(routineID, endsAt, 90)

      const wrapper = await mountWorkout()

      const banner = restBanner(wrapper)
      expect(banner.exists()).toBe(true)
      expect(banner.get('strong').text()).toBe('00:45')
      wrapper.unmount()
    })

    test('sits with the header as session chrome; the actions stay in the flow', async () => {
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      const children = wrapper.get('.workout-shell').element.children
      const classes = Array.from(children).map((child) => child.className)
      expect(classes[0]).toContain('workout-header')
      expect(classes[1]).toContain('rest-banner')
      expect(classes[classes.length - 1]).toContain('exercise-stack')
      wrapper.unmount()
    })
  })

  describe('the exercise list', () => {
    test('stacks the list and the tools in reading order', async () => {
      const wrapper = await mountWorkout()

      const children = Array.from(wrapper.get('.exercise-stack').element.children).map(
        (child) => child.className,
      )
      const indexOf = (name: string) => children.findIndex((cls) => cls.includes(name))
      expect(indexOf('exercise-list')).toBeGreaterThanOrEqual(0)
      expect(indexOf('workout-tools')).toBeGreaterThan(indexOf('exercise-list'))

      // The forward action lives inside the exercise it acts on, under its sets.
      const panel = Array.from(wrapper.get('.exercise-panel').element.children).map(
        (child) => child.className,
      )
      expect(panel[panel.length - 1]).toContain('action-block')

      // The quieter finish action sits below the add-exercise affordance.
      const tools = Array.from(wrapper.get('.workout-tools').element.children).map(
        (child) => child.className,
      )
      expect(tools.findIndex((cls) => cls.includes('finish-early'))).toBeGreaterThan(
        tools.findIndex((cls) => cls.includes('add-exercise')),
      )
      wrapper.unmount()
    })

    test('holds every exercise, with exactly one of them open', async () => {
      const wrapper = await mountWorkout()

      const items = wrapper.findAll('.exercise-item')
      expect(items.map((item) => item.get('.exercise-name').text())).toEqual([
        'Bench Press',
        'Squat',
      ])
      expect(wrapper.findAll('.exercise-panel')).toHaveLength(1)
      expect(items[0].classes()).toContain('open')
      expect(items[0].get('.exercise-header').attributes('aria-expanded')).toBe('true')
      expect(items[1].get('.exercise-header').attributes('aria-expanded')).toBe('false')
      wrapper.unmount()
    })

    test('opens whichever header is tapped, without completing anything first', async () => {
      const wrapper = await mountWorkout()

      // No gate: the second exercise opens while the first is untouched.
      await wrapper.findAll('.exercise-header')[1].trigger('click')
      await flushPromises()

      const items = wrapper.findAll('.exercise-item')
      expect(items[0].classes()).not.toContain('open')
      expect(items[1].classes()).toContain('open')
      expect(wrapper.findAll('.exercise-panel')).toHaveLength(1)
      expect(wrapper.find('input[aria-label="Squat set 1 weight"]').exists()).toBe(true)
      expect(wrapper.find('input[aria-label="Bench Press set 1 weight"]').exists()).toBe(false)
      expect(useWorkoutStore().getCompletedExerciseIds(routineID)).toHaveLength(0)

      // And back again: the list is the way around the session.
      await wrapper.findAll('.exercise-header')[0].trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.exercise-item')[0].classes()).toContain('open')
      wrapper.unmount()
    })

    test('numbers every exercise, completed ones included', async () => {
      const wrapper = await mountWorkout()

      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // The indicator stays the position of the exercise rather than turning
      // into a tick: completion is reported in the line underneath.
      const indicators = wrapper.findAll('.exercise-index')
      expect(indicators.map((indicator) => indicator.text())).toEqual(['1', '2'])
      expect(indicators[0].find('svg').exists()).toBe(false)
      wrapper.unmount()
    })

    test('reports what a collapsed exercise is waiting for', async () => {
      const wrapper = await mountWorkout()

      const collapsed = () => wrapper.findAll('.exercise-item')[1].get('.exercise-copy small')
      expect(collapsed().text()).toBe('Not started')

      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      expect(wrapper.findAll('.exercise-item')[0].get('.exercise-copy small').text()).toBe(
        'Exercise completed · 1 set logged',
      )
      wrapper.unmount()
    })

    test('keeps a completed exercise ticked off above its sets', async () => {
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // Completing the final exercise keeps it open, now labelled as
      // completed, with its sets still visible beneath the label.
      await wrapper.get('input[aria-label="Squat set 1 weight"]').setValue('100')
      await wrapper.get('input[aria-label="Squat set 1 reps"]').setValue('5')
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      expect(wrapper.get('.exercise-item.open .exercise-name').text()).toBe('Squat')
      expect(wrapper.get('.completed-exercise').text()).toContain('Exercise completed')
      expect(wrapper.find('input[aria-label="Squat set 1 weight"]').exists()).toBe(true)
      wrapper.unmount()
    })

    test('marks a completed set with a rendered check icon', async () => {
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      // A complete set swaps its number for the check mark. Asserting on the
      // rendered svg catches an icon that is referenced but never imported.
      expect(wrapper.find('.set-row.complete .set-number svg').exists()).toBe(true)
      wrapper.unmount()
    })
  })

  describe('exercise progression', () => {
    test('advances through the plain-text complete-exercise action', async () => {
      const wrapper = await mountWorkout()

      const primary = wrapper.get('.primary-action')
      expect(primary.text()).toBe('Complete exercise')
      // No icon: the label sits centred on the screen's dominant control.
      expect(primary.find('svg').exists()).toBe(false)

      await logFirstSet(wrapper)
      await primary.trigger('submit')
      await flushPromises()

      expect(wrapper.get('.exercise-item.open .exercise-name').text()).toBe('Squat')
    })

    test('keeps the label on the exercise and puts what follows in a hint', async () => {
      const wrapper = await mountWorkout()

      expect(wrapper.get('.primary-action').text()).toBe('Complete exercise')
      expect(wrapper.get('.next-up').text()).toBe('then: Squat')

      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // The last exercise reads the same; only the hint changes.
      expect(wrapper.get('.primary-action').text()).toBe('Complete exercise')
      expect(wrapper.get('.next-up').text()).toBe('then: finish')

      await wrapper.get('input[aria-label="Squat set 1 weight"]').setValue('100')
      await wrapper.get('input[aria-label="Squat set 1 reps"]').setValue('5')
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // Nothing left to complete: finishing is what the button is for now.
      expect(wrapper.get('.primary-action').text()).toBe('Finish workout')
      expect(wrapper.find('.next-up').exists()).toBe(false)
      wrapper.unmount()
    })

    test('discards an untouched set row rather than blocking the way out', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      // Nothing typed anywhere: completing still moves the session on.
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      expect(workoutStore.getSets(routineID, benchPress.id)).toHaveLength(0)
      expect(workoutStore.getCompletedExerciseIds(routineID)).toContain(benchPress.id)
      expect(wrapper.get('.exercise-item.open .exercise-name').text()).toBe('Squat')
      wrapper.unmount()
    })

    test('discards a half-typed row instead of standing in its way', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      await wrapper.get('input[aria-label="Bench Press set 1 weight"]').setValue('80')
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // A set without reps is never saved, so it costs nothing to drop it.
      expect(workoutStore.getSets(routineID, benchPress.id)).toHaveLength(0)
      expect(wrapper.get('.exercise-item.open .exercise-name').text()).toBe('Squat')
      wrapper.unmount()
    })

    test('keeps every logged set and drops only the trailing empty row', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      await logFirstSet(wrapper)
      expect(workoutStore.getSets(routineID, benchPress.id)).toHaveLength(2)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      const sets = workoutStore.getSets(routineID, benchPress.id)
      expect(sets).toHaveLength(1)
      expect(sets[0].weight).toBe(80)
      wrapper.unmount()
    })

    test('gives a reopened exercise a row to type into again', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      expect(workoutStore.getSets(routineID, squat.id)).toHaveLength(0)

      await wrapper.get('.completed-exercise button').trigger('click')
      await flushPromises()

      expect(workoutStore.getSets(routineID, squat.id)).toHaveLength(1)
      wrapper.unmount()
    })
  })

  describe('previous values and set correction', () => {
    beforeEach(() => {
      getPreviousWorkoutSets.mockResolvedValue({
        exerciseSets: [
          create(ExerciseSetsSchema, {
            exercise: { id: benchPress.id },
            sets: [{ reps: 8, weight: 42.5, weightUnit: WeightUnit.KILOGRAMS }],
          }),
        ],
      })
    })

    test('shows the previous session values inside the set rows', async () => {
      const wrapper = await mountWorkout()

      const rows = wrapper.findAll('.set-row')
      expect(rows[0].get('.previous-value').text()).toBe('42.5 kg · 8')

      await logFirstSet(wrapper)
      const updatedRows = wrapper.findAll('.set-row')
      expect(updatedRows[1].get('.previous-value').text()).toBe('—')
      wrapper.unmount()
    })

    test('leaves an empty field empty on focus unless the account asked for the prefill', async () => {
      const wrapper = await mountWorkout()

      const weight = wrapper.get('input[aria-label="Bench Press set 1 weight"]')
      await weight.trigger('focus')
      expect((weight.element as HTMLInputElement).value).toBe('')
      wrapper.unmount()
    })

    test('copies the previous value into an empty field on focus only', async () => {
      getCurrentUser.mockResolvedValue({
        user: { weightUnit: WeightUnit.KILOGRAMS, autofillSets: true },
      })
      const wrapper = await mountWorkout()

      const weight = wrapper.get('input[aria-label="Bench Press set 1 weight"]')
      await weight.trigger('focus')
      expect((weight.element as HTMLInputElement).value).toBe('42.5')

      await weight.setValue('80')
      await weight.trigger('focus')
      expect((weight.element as HTMLInputElement).value).toBe('80')
      wrapper.unmount()
    })

    test('corrects a completed set without restarting the rest timer', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      const endsAt = workoutStore.getRestTimer(routineID).endsAt
      expect(endsAt).toBeDefined()
      expect(wrapper.get('.set-row').classes()).toContain('complete')

      await wrapper.get('input[aria-label="Bench Press set 1 weight"]').setValue('85')

      expect(wrapper.get('.set-row').classes()).toContain('complete')
      expect(workoutStore.getSets(routineID, benchPress.id)[0].weight).toBe(85)
      expect(workoutStore.getRestTimer(routineID).endsAt).toBe(endsAt)
      wrapper.unmount()
    })
  })

  describe('finish sheet', () => {
    test('always confirms through the sheet and collects the note there', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      // No always-visible note card on the page any more.
      expect(wrapper.find('.note-card').exists()).toBe(false)

      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('input[aria-label="Squat set 1 weight"]').setValue('100')
      await wrapper.get('input[aria-label="Squat set 1 reps"]').setValue('5')
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()

      // Everything is complete, yet finishing still pauses on the sheet so
      // the note can be written before the save.
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      expect(createWorkout).not.toHaveBeenCalled()

      const noteInput = wrapper.get('.sheet-panel textarea')
      await noteInput.setValue('Felt strong today.')
      expect(workoutStore.getNote(routineID)).toBe('Felt strong today.')

      await wrapper.get('.sheet-actions button.primary').trigger('click')
      await flushPromises()

      expect(createWorkout).toHaveBeenCalledTimes(1)
      expect(createWorkout.mock.calls[0][0].note).toBe('Felt strong today.')
      wrapper.unmount()
    })
  })

  describe('offline finish', () => {
    test('queues the workout and clears the draft when the network is unreachable', async () => {
      getRoutine.mockResolvedValue({
        routine: create(RoutineSchema, { name: 'Push Day', exercises: [benchPress] }),
      })
      createWorkout.mockRejectedValue(ConnectError.from(new TypeError('Failed to fetch')))

      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('.sheet-actions button.primary').trigger('click')
      await flushPromises()

      const queue = useMutationQueueStore()
      expect(queue.pending).toHaveLength(1)
      expect(queue.pending[0].method).toContain('CreateWorkout')
      expect(useWorkoutStore().workouts[routineID]).toBeUndefined()
      expect(routerReplace).toHaveBeenCalledWith('/home')
      wrapper.unmount()
    })

    test('still reports other failures as errors', async () => {
      getRoutine.mockResolvedValue({
        routine: create(RoutineSchema, { name: 'Push Day', exercises: [benchPress] }),
      })
      createWorkout.mockRejectedValue(new Error('boom'))

      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('.primary-action').trigger('submit')
      await flushPromises()
      await wrapper.get('.sheet-actions button.primary').trigger('click')
      await flushPromises()

      expect(useMutationQueueStore().pending).toHaveLength(0)
      expect(wrapper.get('.action-block strong').text()).toContain('could not be saved')
      wrapper.unmount()
    })
  })

  describe('weight unit', () => {
    test('shows the unit from the profile preference as a static suffix, not a toggle', async () => {
      getCurrentUser.mockResolvedValue({ user: { weightUnit: WeightUnit.POUNDS } })
      const wrapper = await mountWorkout()

      const suffix = wrapper.get('.unit-entry .unit-suffix')
      expect(suffix.text()).toBe('lbs')
      expect(wrapper.find('.unit-entry button').exists()).toBe(false)
      expect(wrapper.find('[role="group"]').exists()).toBe(false)
      wrapper.unmount()
    })

    test('logs new sets using the profile preference unit', async () => {
      getCurrentUser.mockResolvedValue({ user: { weightUnit: WeightUnit.POUNDS } })
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      await logFirstSet(wrapper)

      expect(workoutStore.getSets(routineID, benchPress.id)[0].weightUnit).toBe(WeightUnit.POUNDS)
      wrapper.unmount()
    })

    // A draft outlives the component: leaving a workout keeps it in local
    // storage, so the preference can change before the athlete comes back.
    test('converts a resumed draft saved under the previous preference', async () => {
      const workoutStore = useWorkoutStore()
      workoutStore.initialiseWorkout(routineID)
      workoutStore.addEmptySet(routineID, benchPress.id, WeightUnit.POUNDS)
      workoutStore.getSets(routineID, benchPress.id)[0].weight = 100
      workoutStore.getSets(routineID, benchPress.id)[0].reps = 8

      getCurrentUser.mockResolvedValue({ user: { weightUnit: WeightUnit.KILOGRAMS } })
      const wrapper = await mountWorkout()

      // The row must not read "100" beside a "kg" suffix while still being
      // stored as pounds: that saves a weight the athlete never entered.
      expect(wrapper.get('.unit-entry .unit-suffix').text()).toBe('kg')
      const set = workoutStore.getSets(routineID, benchPress.id)[0]
      expect(set.weight).toBe(45.36)
      expect(set.weightUnit).toBe(WeightUnit.KILOGRAMS)
      wrapper.unmount()
    })
  })

  describe('distance and time', () => {
    const running = create(ExerciseSchema, {
      id: 'exercise-running',
      name: 'Running',
      metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
    })

    beforeEach(() => {
      getRoutine.mockResolvedValue({
        routine: create(RoutineSchema, { name: 'Cardio', exercises: [running] }),
      })
    })

    test('maps distance to a suffixed decimal input and time to a duration input', async () => {
      getCurrentUser.mockResolvedValue({
        user: { weightUnit: WeightUnit.KILOGRAMS, distanceUnit: DistanceUnit.MILES },
      })
      const wrapper = await mountWorkout()

      expect(wrapper.get('.unit-entry .unit-suffix').text()).toBe('mi')
      const distanceInput = wrapper.get('input[aria-label="Running set 1 distance"]')
      expect(distanceInput.attributes('inputmode')).toBe('decimal')
      const timeInput = wrapper.get('input[aria-label="Running set 1 time"]')
      expect(timeInput.attributes('placeholder')).toBe('m:ss')
      wrapper.unmount()
    })

    test('logs sets with the preferred distance unit and parsed duration', async () => {
      getCurrentUser.mockResolvedValue({
        user: { weightUnit: WeightUnit.KILOGRAMS, distanceUnit: DistanceUnit.MILES },
      })
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()

      await wrapper.get('input[aria-label="Running set 1 distance"]').setValue('3.5')
      await wrapper.get('input[aria-label="Running set 1 time"]').setValue('12:30')

      const set = workoutStore.getSets(routineID, running.id)[0]
      expect(set.distance).toBe(3.5)
      expect(set.durationSeconds).toBe(750)
      expect(set.distanceUnit).toBe(DistanceUnit.MILES)
      wrapper.unmount()
    })

    test('converts a resumed draft distance saved under the previous preference', async () => {
      const workoutStore = useWorkoutStore()
      workoutStore.initialiseWorkout(routineID)
      workoutStore.addEmptySet(routineID, running.id, WeightUnit.KILOGRAMS, DistanceUnit.MILES)
      workoutStore.getSets(routineID, running.id)[0].distance = 10
      workoutStore.getSets(routineID, running.id)[0].durationSeconds = 3600

      getCurrentUser.mockResolvedValue({
        user: { weightUnit: WeightUnit.KILOGRAMS, distanceUnit: DistanceUnit.KILOMETERS },
      })
      const wrapper = await mountWorkout()

      expect(wrapper.get('.unit-entry .unit-suffix').text()).toBe('km')
      const set = workoutStore.getSets(routineID, running.id)[0]
      expect(set.distance).toBe(16.09)
      expect(set.distanceUnit).toBe(DistanceUnit.KILOMETERS)
      wrapper.unmount()
    })
  })
})
