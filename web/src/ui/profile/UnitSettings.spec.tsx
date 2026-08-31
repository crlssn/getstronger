// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/http/requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/requests')>()),
  getCurrentUser: vi.fn(),
  updateUserWeightUnit: vi.fn(),
  updateUserDistanceUnit: vi.fn(),
}))

import * as requests from '@/http/requests'
import { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'
import {
  GetUserResponseSchema,
  UpdateUserDistanceUnitResponseSchema,
  UpdateUserWeightUnitResponseSchema,
} from '@/proto/api/v1/user_service_pb'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { useToastStore } from '@/stores/toasts'
import { renderWithProviders } from '@/ui/testing'
import { UnitSettings } from './UnitSettings'

const mocked = {
  getCurrentUser: vi.mocked(requests.getCurrentUser),
  updateUserWeightUnit: vi.mocked(requests.updateUserWeightUnit),
  updateUserDistanceUnit: vi.mocked(requests.updateUserDistanceUnit),
}

const me = 'user-me'

const account = (units: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit } = {}) =>
  create(GetUserResponseSchema, {
    user: {
      id: me,
      name: 'Alex Morgan',
      username: 'alex',
      email: 'alex@example.com',
      weightUnit: units.weightUnit ?? WeightUnit.KILOGRAMS,
      distanceUnit: units.distanceUnit ?? DistanceUnit.KILOMETERS,
    },
  })

const render = () => renderWithProviders(<UnitSettings />, { route: '/settings/units' })

const group = (label: string) => within(screen.getByRole('group', { name: label }))

describe('UnitSettings', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((mock) => mock.mockReset())
    mocked.getCurrentUser.mockResolvedValue(account())
    mocked.updateUserWeightUnit.mockResolvedValue(
      create(UpdateUserWeightUnitResponseSchema, { user: account().user }),
    )
    mocked.updateUserDistanceUnit.mockResolvedValue(
      create(UpdateUserDistanceUnitResponseSchema, { user: account().user }),
    )
    useAuthStore.setState({ userId: me })
    usePreferencesStore.setState({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
    })
    useToastStore.getState().dismiss()
  })

  test('opens on the units the account is set to', () => {
    render()

    expect(group('Preferred weight unit').getByRole('button', { name: 'kg' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(group('Preferred distance unit').getByRole('button', { name: 'km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  // The cached preference is drawn immediately and the account's own value
  // replaces it when the server answers, so the page never opens on a skeleton
  // over something it already knows.
  test('takes the account as the last word on what the units are', async () => {
    mocked.getCurrentUser.mockResolvedValue(account({ weightUnit: WeightUnit.POUNDS }))
    render()

    await waitFor(() => expect(usePreferencesStore.getState().weightUnit).toBe(WeightUnit.POUNDS))
    expect(group('Preferred weight unit').getByRole('button', { name: 'lbs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  // Offline the read is answered from the cache or not at all; either way the
  // last known units are the right ones to show and to change.
  test('keeps the cached units when the account cannot be reached', async () => {
    mocked.getCurrentUser.mockResolvedValue(undefined)
    usePreferencesStore.setState({ weightUnit: WeightUnit.POUNDS })
    render()

    await waitFor(() => expect(mocked.getCurrentUser).toHaveBeenCalled())
    expect(group('Preferred weight unit').getByRole('button', { name: 'lbs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  describe.each([
    ['Preferred weight unit', 'lbs', () => mocked.updateUserWeightUnit, WeightUnit.POUNDS],
    ['Preferred distance unit', 'mi', () => mocked.updateUserDistanceUnit, DistanceUnit.MILES],
  ] as const)('%s', (label, option, request, expected) => {
    test('is applied straight away and then saved', async () => {
      render()

      await userEvent.click(group(label).getByRole('button', { name: option }))

      expect(group(label).getByRole('button', { name: option })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await waitFor(() => expect(request()).toHaveBeenCalledWith(expected))
      expect(useToastStore.getState().toast).not.toBeNull()
    })

    // A failure reverts the control and the row says why inline, or the
    // control appears to snap back on its own.
    test('reverts and says why when the request fails', async () => {
      request().mockResolvedValue(undefined)
      render()

      await userEvent.click(group(label).getByRole('button', { name: option }))

      await waitFor(() =>
        expect(group(label).getByRole('button', { name: option })).toHaveAttribute(
          'aria-pressed',
          'false',
        ),
      )
      expect(screen.getByRole('alert')).toHaveTextContent('Could not update')
      expect(useToastStore.getState().toast).toBeNull()
    })

    test('does nothing when the current option is picked again', async () => {
      render()

      await userEvent.click(group(label).getAllByRole('button')[0])

      expect(request()).not.toHaveBeenCalled()
    })
  })
})
