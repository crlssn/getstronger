// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { DateTime } from 'luxon'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useStreakStore } from '@/stores/streak'
import StreakCard from '@/ui/components/StreakCard.vue'

describe('StreakCard', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-14T00:00:00Z'))
    setActivePinia(createPinia())
  })

  test('shows only a check for one workout and adds the count for multiple workouts', () => {
    const store = useStreakStore()
    const currentWeek = `${DateTime.now().weekYear}-${DateTime.now().weekNumber}`
    const previousWeek = DateTime.now().minus({ weeks: 1 })
    const previousWeekKey = `${previousWeek.weekYear}-${previousWeek.weekNumber}`
    store.loaded = true
    store.streak = 2
    store.thisWeekLogged = true
    store.weekWorkoutCounts = { [previousWeekKey]: 1, [currentWeek]: 3 }
    store.load = vi.fn(async () => undefined)

    const wrapper = mount(StreakCard)
    const blocks = wrapper.findAll('.week-block.complete')
    const oneWorkoutBlock = blocks[blocks.length - 2]
    const multipleWorkoutBlock = blocks[blocks.length - 1]

    expect(oneWorkoutBlock?.find('.week-workout-count').exists()).toBe(false)
    expect(multipleWorkoutBlock?.get('.week-workout-count').text()).toBe('3')
    expect(multipleWorkoutBlock?.attributes('aria-label')).toContain('3 workouts logged')
  })

  test('caps the visible workout count at 9+ while announcing the actual count', () => {
    const store = useStreakStore()
    const currentWeek = `${DateTime.now().weekYear}-${DateTime.now().weekNumber}`
    store.loaded = true
    store.streak = 1
    store.thisWeekLogged = true
    store.weekWorkoutCounts = { [currentWeek]: 12 }
    store.load = vi.fn(async () => undefined)

    const wrapper = mount(StreakCard)
    const currentWeekBlock = wrapper.get('.week-block.current.complete')

    expect(currentWeekBlock.get('.week-workout-count').text()).toBe('9+')
    expect(currentWeekBlock.attributes('aria-label')).toContain('12 workouts logged')
  })
})
