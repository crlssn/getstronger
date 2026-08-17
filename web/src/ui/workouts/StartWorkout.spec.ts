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
import { RoutineSchema } from '@/proto/api/v1/routine_service_pb'
import { useWorkoutStore } from '@/stores/workout'
import StartWorkout from '@/ui/workouts/StartWorkout.vue'

const {
  createWorkout,
  getCurrentUser,
  getExercise,
  getPreviousWorkoutSets,
  getRoutine,
  listExercises,
  routerPush,
  routerReplace,
} = vi.hoisted(() => ({
  createWorkout: vi.fn(),
  getCurrentUser: vi.fn(),
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
  getExercise,
  getPreviousWorkoutSets,
  getRoutine,
  listExercises,
}))

vi.mock('@/router/router', () => ({
  default: { push: routerPush, replace: routerReplace },
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
  await wrapper.get('input[aria-label="Bench Press set 1 Reps"]').setValue('8')
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
    createWorkout.mockResolvedValue({ workoutId: 'workout-1' })
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

  describe('rest timer pill', () => {
    const restPill = (wrapper: Awaited<ReturnType<typeof mountWorkout>>) =>
      wrapper.find('.session-dock .rest-pill[aria-label="Rest timer"]')

    test('floats above the action dock once a set with a rest time completes', async () => {
      const wrapper = await mountWorkout()

      expect(restPill(wrapper).exists()).toBe(false)
      await logFirstSet(wrapper)

      const pill = restPill(wrapper)
      expect(pill.exists()).toBe(true)
      expect(pill.get('strong').text()).toBe('01:30')
      expect(wrapper.get('.workout-shell').classes()).toContain('resting')
      wrapper.unmount()
    })

    test('extends by thirty seconds and skips', async () => {
      const workoutStore = useWorkoutStore()
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      await wrapper.get('.rest-pill button:first-of-type').trigger('click')
      expect(restPill(wrapper).get('strong').text()).toBe('02:00')
      const extended = Date.parse(workoutStore.getRestTimer(routineID).endsAt ?? '')
      expect(extended - Date.now()).toBe(120_000)

      await wrapper.get('.rest-pill button:last-of-type').trigger('click')
      expect(restPill(wrapper).exists()).toBe(false)
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

      const pill = restPill(wrapper)
      expect(pill.exists()).toBe(true)
      expect(pill.get('strong').text()).toBe('00:45')
      wrapper.unmount()
    })

    test('keeps only the rest pill in the fixed region; the actions stay in the flow', async () => {
      const wrapper = await mountWorkout()
      await logFirstSet(wrapper)

      const dock = wrapper.get('.session-dock')
      expect(dock.find('.rest-pill').exists()).toBe(true)
      expect(dock.find('.finish-dock').exists()).toBe(false)
      expect(wrapper.find('.finish-dock').exists()).toBe(true)
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

    test('copies the previous value into an empty field on focus only', async () => {
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
