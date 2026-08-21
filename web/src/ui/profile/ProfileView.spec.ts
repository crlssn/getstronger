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

const {
  getCurrentUser,
  getDashboard,
  updateUserAutofillSets,
  updateUserDistanceUnit,
  updateUserName,
  updateUserUsername,
  updateUserWeightUnit,
} = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDashboard: vi.fn(),
  updateUserAutofillSets: vi.fn(),
  updateUserDistanceUnit: vi.fn(),
  updateUserName: vi.fn(),
  updateUserUsername: vi.fn(),
  updateUserWeightUnit: vi.fn(),
}))

vi.mock('@/http/requests', () => ({
  getCurrentUser,
  getDashboard,
  updateUserAutofillSets,
  updateUserDistanceUnit,
  updateUserName,
  updateUserUsername,
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
        name: 'Alex Morgan',
        username: 'alex',
        email: 'alex@example.com',
        weightUnit: WeightUnit.KILOGRAMS,
        distanceUnit: DistanceUnit.KILOMETERS,
        autofillSets: false,
      },
    })
    getDashboard.mockResolvedValue({ recentWorkouts: [], personalBests: [], volumeThisWeek: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows the name and updates it through the editor sheet', async () => {
    updateUserName.mockResolvedValue({ user: { name: 'Alex Morgan-Reid' } })
    const wrapper = await mountProfile()

    expect(wrapper.text()).toContain('Alex Morgan')

    await wrapper.get('[aria-label="Change name"]').trigger('click')
    await wrapper.get('#edit-name').setValue('Alex Morgan-Reid')
    await wrapper.get('#name-form').trigger('submit')
    await flushPromises()

    expect(updateUserName).toHaveBeenCalledWith('Alex Morgan-Reid')
    expect(wrapper.text()).toContain('Alex Morgan-Reid')
    expect(wrapper.find('#edit-name').exists()).toBe(false)
    // The avatar reads the same name, so it has to follow the rename.
    expect(wrapper.get('.avatar').text()).toBe('AM')
  })

  test('keeps the name sheet open when the update fails', async () => {
    updateUserName.mockResolvedValue(undefined)
    const wrapper = await mountProfile()

    await wrapper.get('[aria-label="Change name"]').trigger('click')
    await wrapper.get('#edit-name').setValue('Alex Morgan-Reid')
    await wrapper.get('#name-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Alex Morgan')
    expect(wrapper.find('#edit-name').exists()).toBe(true)
  })

  test('shows the username and updates it through the editor sheet', async () => {
    updateUserUsername.mockResolvedValue({ user: { username: 'alexm' } })
    const wrapper = await mountProfile()

    expect(wrapper.text()).toContain('@alex')

    await wrapper.get('[aria-label="Change username"]').trigger('click')
    const input = wrapper.get('#edit-username')
    await input.setValue('AlexM')
    await wrapper.get('#username-form').trigger('submit')
    await flushPromises()

    // The draft is lowercased as it is typed, so the API sees the stored form.
    expect(updateUserUsername).toHaveBeenCalledWith('alexm')
    expect(wrapper.text()).toContain('@alexm')
    expect(wrapper.find('#edit-username').exists()).toBe(false)
  })

  test('keeps the username sheet open when the update fails', async () => {
    updateUserUsername.mockResolvedValue(undefined)
    const wrapper = await mountProfile()

    await wrapper.get('[aria-label="Change username"]').trigger('click')
    await wrapper.get('#edit-username').setValue('taken')
    await wrapper.get('#username-form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('@alex')
    expect(wrapper.find('#edit-username').exists()).toBe(true)
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

  const autofillSegment = (wrapper: Awaited<ReturnType<typeof mountProfile>>) =>
    wrapper.get('[aria-label="Repeat my last set"]')

  test('shows the set autofill as off for an account that never enabled it', async () => {
    const wrapper = await mountProfile()

    expect(autofillSegment(wrapper).get('button:first-of-type').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  test('turns the set autofill on and remembers it for the workout screen', async () => {
    updateUserAutofillSets.mockResolvedValue({ user: { autofillSets: true } })
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()

    await autofillSegment(wrapper).get('button:last-of-type').trigger('click')
    await flushPromises()

    expect(updateUserAutofillSets).toHaveBeenCalledWith(true)
    expect(preferencesStore.autofillSets).toBe(true)
    expect(autofillSegment(wrapper).get('button:last-of-type').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  test('reverts the set autofill and says so if the request fails', async () => {
    updateUserAutofillSets.mockResolvedValue(undefined)
    const wrapper = await mountProfile()
    const preferencesStore = usePreferencesStore()
    const alertStore = useAlertStore()

    await autofillSegment(wrapper).get('button:last-of-type').trigger('click')
    await flushPromises()

    expect(preferencesStore.autofillSets).toBe(false)
    expect(alertStore.alert).toMatchObject({
      type: 'error',
      message: 'Could not update the set prefill. Please try again.',
    })
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
