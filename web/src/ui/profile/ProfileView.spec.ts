// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { i18n } from '@/i18n'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import ProfileView from '@/ui/profile/ProfileView.vue'

const { getCurrentUser, getDashboard, updateUserDistanceUnit, updateUserWeightUnit } = vi.hoisted(
  () => ({
    getCurrentUser: vi.fn(),
    getDashboard: vi.fn(),
    updateUserDistanceUnit: vi.fn(),
    updateUserWeightUnit: vi.fn(),
  }),
)

vi.mock('@/http/requests', () => ({
  getCurrentUser,
  getDashboard,
  updateUserDistanceUnit,
  updateUserWeightUnit,
}))

vi.mock('@/http/clients', () => ({
  notificationClient: {
    getUnreadNotificationCount: vi.fn().mockResolvedValue({ count: 0n }),
    unreadNotifications: vi.fn(),
  },
}))

const mountProfile = async () => {
  const wrapper = mount(ProfileView, {
    global: { plugins: [i18n] },
  })
  await flushPromises()
  return wrapper
}

describe('ProfileView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().userId = 'user-1'

    getCurrentUser.mockResolvedValue({
      user: {
        id: 'user-1',
        firstName: 'Alex',
        lastName: 'Morgan',
        email: 'alex@example.com',
        weightUnit: WeightUnit.KILOGRAMS,
        distanceUnit: DistanceUnit.KILOMETERS,
      },
    })
    getDashboard.mockResolvedValue({ recentWorkouts: [], personalBests: [], volumeThisWeek: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows the weight unit from the fetched profile as the active preference', async () => {
    const wrapper = await mountProfile()

    const kg = wrapper.get('.segmented button:first-of-type')
    const lbs = wrapper.get('.segmented button:last-of-type')
    expect(kg.attributes('aria-pressed')).toBe('true')
    expect(lbs.attributes('aria-pressed')).toBe('false')
  })

  test('updates the preference and persists it via the API when a unit is chosen', async () => {
    updateUserWeightUnit.mockResolvedValue({ user: { weightUnit: WeightUnit.POUNDS } })
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()

    await wrapper.get('.segmented button:last-of-type').trigger('click')
    await flushPromises()

    expect(updateUserWeightUnit).toHaveBeenCalledWith(WeightUnit.POUNDS)
    expect(preferencesStore.weightUnit).toBe(WeightUnit.POUNDS)
    const lbs = wrapper.get('.segmented button:last-of-type')
    expect(lbs.attributes('aria-pressed')).toBe('true')
  })

  test('reverts the optimistic update and says so if the request fails', async () => {
    updateUserWeightUnit.mockResolvedValue(undefined)
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()
    const alertStore = useAlertStore()

    await wrapper.get('.segmented button:last-of-type').trigger('click')
    await flushPromises()

    expect(preferencesStore.weightUnit).toBe(WeightUnit.KILOGRAMS)
    const kg = wrapper.get('.segmented button:first-of-type')
    expect(kg.attributes('aria-pressed')).toBe('true')
    // The request helper is silent for network failures, so without this the
    // button would appear to snap back on its own.
    expect(alertStore.alert).toMatchObject({
      type: 'error',
      message: 'Could not update weight unit. Please try again.',
    })
  })

  const distanceSegment = (wrapper: Awaited<ReturnType<typeof mountProfile>>) =>
    wrapper.get('[aria-label="Preferred distance unit"]')

  test('shows the distance unit from the fetched profile as the active preference', async () => {
    const wrapper = await mountProfile()

    const km = distanceSegment(wrapper).get('button:first-of-type')
    const mi = distanceSegment(wrapper).get('button:last-of-type')
    expect(km.attributes('aria-pressed')).toBe('true')
    expect(mi.attributes('aria-pressed')).toBe('false')
  })

  test('updates the distance preference and persists it via the API when a unit is chosen', async () => {
    updateUserDistanceUnit.mockResolvedValue({ user: { distanceUnit: DistanceUnit.MILES } })
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()

    await distanceSegment(wrapper).get('button:last-of-type').trigger('click')
    await flushPromises()

    expect(updateUserDistanceUnit).toHaveBeenCalledWith(DistanceUnit.MILES)
    expect(preferencesStore.distanceUnit).toBe(DistanceUnit.MILES)
    expect(distanceSegment(wrapper).get('button:last-of-type').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  test('reverts the optimistic distance update and says so if the request fails', async () => {
    updateUserDistanceUnit.mockResolvedValue(undefined)
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()
    const alertStore = useAlertStore()

    await distanceSegment(wrapper).get('button:last-of-type').trigger('click')
    await flushPromises()

    expect(preferencesStore.distanceUnit).toBe(DistanceUnit.KILOMETERS)
    expect(distanceSegment(wrapper).get('button:first-of-type').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(alertStore.alert).toMatchObject({
      type: 'error',
      message: 'Could not update distance unit. Please try again.',
    })
  })
})
