// @vitest-environment jsdom

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, test } from 'vitest'

import { DistanceUnit, ExerciseMetric, WeightUnit } from '@/proto/api/v1/shared_pb'
import { usePreferencesStore } from '@/stores/preferences'
import { renderWithProviders } from '@/ui/testing'
import { ExerciseMeasurementSettings } from './ExerciseMeasurementSettings'

const Harness = ({
  metrics: initialMetrics = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  metricsLocked = false,
}) => {
  const [metrics, setMetrics] = useState(initialMetrics)

  return (
    <ExerciseMeasurementSettings
      metrics={metrics}
      onMetricsChange={setMetrics}
      metricsLocked={metricsLocked}
    />
  )
}

// The preset row and the measurement grid both mention "Weight", so each is
// found inside its own group.
const inGroup = (label: string, name: string | RegExp) =>
  within(screen.getByRole('group', { name: label })).getByRole('button', { name })

const measurement = (name: string) => inGroup('How do you track it?', new RegExp(`^${name}`))
const preset = (name: string) => inGroup('Common measurement combinations', name)

describe('ExerciseMeasurementSettings', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      weightUnit: WeightUnit.KILOGRAMS,
      distanceUnit: DistanceUnit.KILOMETERS,
    })
  })

  // The card should say what a set will actually be logged in, not what the
  // API's default happens to be.
  test('shows the units the signed-in user has chosen', () => {
    usePreferencesStore.setState({
      weightUnit: WeightUnit.POUNDS,
      distanceUnit: DistanceUnit.MILES,
    })
    renderWithProviders(<Harness />)

    expect(measurement('Weight')).toHaveTextContent('lbs')
    expect(measurement('Distance')).toHaveTextContent('mi')
  })

  test('marks what is measured for a screen reader', () => {
    renderWithProviders(<Harness />)

    expect(measurement('Weight')).toHaveAttribute('aria-pressed', 'true')
    expect(measurement('Distance')).toHaveAttribute('aria-pressed', 'false')
  })

  test('adds and removes a measurement', async () => {
    renderWithProviders(<Harness />)

    await userEvent.click(measurement('Time'))
    expect(measurement('Time')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(measurement('Time'))
    expect(measurement('Time')).toHaveAttribute('aria-pressed', 'false')
  })

  // An exercise that measures nothing cannot log a set.
  test('refuses to drop the last measurement', async () => {
    renderWithProviders(<Harness metrics={[ExerciseMetric.REPS]} />)

    await userEvent.click(measurement('Reps'))

    expect(measurement('Reps')).toHaveAttribute('aria-pressed', 'true')
  })

  test('a preset replaces the selection rather than adding to it', async () => {
    renderWithProviders(<Harness />)

    await userEvent.click(preset('Distance'))

    expect(measurement('Distance')).toHaveAttribute('aria-pressed', 'true')
    expect(measurement('Time')).toHaveAttribute('aria-pressed', 'true')
    expect(measurement('Weight')).toHaveAttribute('aria-pressed', 'false')
    expect(measurement('Reps')).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows which preset the current selection matches', () => {
    renderWithProviders(<Harness metrics={[ExerciseMetric.TIME]} />)

    expect(preset('Timed')).toHaveAttribute('aria-pressed', 'true')
    expect(preset('Weight')).toHaveAttribute('aria-pressed', 'false')
  })

  // A logged set is stored in the columns the exercise measured by at the time,
  // so the athlete is shown what those are rather than a control that fails.
  describe('once sets have been logged', () => {
    test('reads the measurements back instead of offering them', () => {
      renderWithProviders(<Harness metricsLocked />)

      const locked = screen.getByRole('list', { name: 'How do you track it?' })
      expect(within(locked).getAllByRole('listitem')).toHaveLength(2)
      expect(locked).toHaveTextContent('Weight')
      expect(locked).toHaveTextContent('Reps')
      expect(locked).not.toHaveTextContent('Distance')
      expect(screen.queryByRole('button', { name: /^Weight/ })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('group', { name: 'Common measurement combinations' }),
      ).not.toBeInTheDocument()
    })

    test('says why they cannot be changed', () => {
      renderWithProviders(<Harness metricsLocked />)

      expect(screen.getByText(/Measurements stay as they are once sets are logged/)).toBeVisible()
    })
  })

  // Rest belongs to the routine that trains the exercise, which can want one
  // length in a strength block and another in a circuit.
  test('does not ask how long the exercise rests', () => {
    renderWithProviders(<Harness />)

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Rest timer')).not.toBeInTheDocument()
  })
})
