// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { Route, Routes } from 'react-router-dom'

import { usePageTitleStore } from '@/stores/pageTitle'
import { useWorkoutStore } from '@/stores/workout'
import { renderWithProviders } from '@/ui/testing'
import { AppDashboard } from './AppDashboard'

const Screen = () => <p>The screen</p>

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route element={<AppDashboard />}>
        <Route path="*" element={<Screen />} />
      </Route>
    </Routes>,
    { route },
  )

const bottomNav = () => screen.queryByRole('navigation', { name: 'Primary navigation' })
const backButton = () =>
  screen.queryByRole('button', { name: /Home|Workout|Training|Exercises|Me/ })

describe('AppDashboard', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'Exercises' })
    useWorkoutStore.setState({ workouts: {} })
  })

  test('renders the screen it wraps', () => {
    renderAt('/home')

    expect(screen.getByText('The screen')).toBeInTheDocument()
  })

  // A tab root opens with its own large title and no nav bar.
  test.each(['/home', '/workout', '/plans', '/routines', '/exercises', '/profile'])(
    'gives %s the tab bar and no back row',
    (route) => {
      renderAt(route)

      expect(bottomNav()).toBeInTheDocument()
      expect(backButton()).not.toBeInTheDocument()
    },
  )

  // A screen pushed on top of one gets the nav bar and a way back.
  test.each(['/exercises/1', '/workouts/1', '/users/1/followers'])(
    'gives %s a back row and the tab bar',
    (route) => {
      renderAt(route)

      expect(bottomNav()).toBeInTheDocument()
      expect(backButton()).toBeInTheDocument()
    },
  )

  // A create or edit screen is a task rather than a place: it keeps the way
  // back and gives up the way sideways, so the form and its one sticky action
  // bar are not sharing the screen with 180px of chrome nobody mid-form wants.
  test.each([
    '/exercises/create',
    '/exercises/1/edit',
    '/routines/create',
    '/routines/1/edit',
    '/plans/create',
    '/plans/1/edit',
    '/workouts/1/edit',
  ])('gives %s a back row and no tab bar', (route) => {
    renderAt(route)

    expect(bottomNav()).not.toBeInTheDocument()
    expect(backButton()).toBeInTheDocument()
  })

  // An active workout takes over the screen: the tab bar would steal logging
  // space and invite accidental mid-workout navigation.
  test.each(['/workouts/quick', '/workouts/routine/routine-1'])(
    'hides the chrome on %s',
    (route) => {
      renderAt(route)

      expect(bottomNav()).not.toBeInTheDocument()
      expect(backButton()).not.toBeInTheDocument()
    },
  )

  // The focused list is derived from the route table, so the shell cannot
  // disagree with the router about which screens it applies to.
  test('does not mistake a neighbouring workout screen for a focused one', () => {
    renderAt('/workouts/1')

    expect(bottomNav()).toBeInTheDocument()
  })
})
