// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import type { Workout } from '@/types/workout'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useNotificationStore } from '@/stores/notifications'
import { quickWorkoutRoutineID, useWorkoutStore } from '@/stores/workout'
import { renderWithProviders } from '@/ui/testing'
import { AppNavBottom } from './AppNavBottom'

const tab = (name: string | RegExp) => screen.getByRole('link', { name })

const inProgress = (overrides: Workout = {}): Workout => ({
  startedAt: '2026-08-14T11:50:00Z',
  exerciseSets: { squat: [{ weight: 100, reps: 5 }] },
  ...overrides,
})

describe('AppNavBottom', () => {
  beforeEach(() => {
    useNotificationStore.setState({ unreadCount: 0 })
    useWorkoutStore.setState({ workouts: {} })
  })

  test('renders the five primary tabs', () => {
    renderWithProviders(<AppNavBottom />, { route: '/home' })

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  test.each([
    ['/home', 'Home'],
    ['/workout', 'Workout'],
    ['/routines', 'Training'],
    ['/exercises', 'Exercises'],
    ['/profile', 'Me'],
  ])('marks the tab for %s as the current page', (route, name) => {
    renderWithProviders(<AppNavBottom />, { route })

    expect(tab(name)).toHaveAttribute('aria-current', 'page')
  })

  // A screen pushed onto a tab keeps that tab lit, so the user can see where
  // they are in the app rather than only where they are on it.
  test.each([
    ['/routines/1', 'Training'],
    ['/workouts/1', 'Workout'],
    ['/notifications', 'Me'],
    ['/progress', 'Me'],
    ['/exercises/1/edit', 'Exercises'],
  ])('keeps the owning tab lit on %s', (route, name) => {
    renderWithProviders(<AppNavBottom />, { route })

    expect(tab(name)).toHaveAttribute('aria-current', 'page')
  })

  describe('notification badge', () => {
    test('is absent when nothing is unread', () => {
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Me').textContent).toBe('Me')
    })

    // The count sits inside the link and before its label, so it reads as
    // part of the link's name — "3Me". Worth revisiting: a bare number says
    // nothing about what it counts.
    test('counts what is unread', () => {
      useNotificationStore.setState({ unreadCount: 3 })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab(/Me/).textContent).toBe('3Me')
    })

    // Three digits do not fit under an icon.
    test('caps at 99+', () => {
      useNotificationStore.setState({ unreadCount: 128 })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab(/Me/).textContent).toBe('99+Me')
    })

    test('goes away while the tab is the current page', () => {
      useNotificationStore.setState({ unreadCount: 3 })
      renderWithProviders(<AppNavBottom />, { route: '/profile' })

      expect(tab('Me').textContent).toBe('Me')
    })
  })

  describe('the workout tab', () => {
    test('goes to the workout screen when nothing is in progress', () => {
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout')).toHaveAttribute('href', '/workout')
    })

    test('resumes a quick workout in progress', () => {
      useWorkoutStore.setState({ workouts: { [quickWorkoutRoutineID]: inProgress() } })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout')).toHaveAttribute('href', '/workouts/quick')
    })

    test('resumes a routine workout in progress', () => {
      useWorkoutStore.setState({ workouts: { 'routine-1': inProgress() } })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout')).toHaveAttribute('href', '/workouts/routine/routine-1')
    })

    // The plan travels as a query parameter so the routine screen knows which
    // plan to advance when the workout is saved.
    test('carries the plan a routine workout belongs to', () => {
      useWorkoutStore.setState({
        workouts: { 'routine-1': inProgress({ planId: 'plan-1' }) },
      })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout')).toHaveAttribute('href', '/workouts/routine/routine-1?plan_id=plan-1')
    })

    // A draft is a workout once a set holds a value. Everything short of that
    // — a routine opened, an exercise picked, a note typed — is preparation,
    // and a tab bar that resumes it is claiming a session nobody started.
    // The stamp is carried too, because a draft left by an earlier release has
    // one from the moment its screen opened.
    test.each([
      ['nothing logged in it', {}],
      ['only a note', { note: 'felt strong' }],
      ['only exercises added', { addedExercises: [create(ExerciseSchema, { id: 'squat' })] }],
      ['only empty sets', { exerciseSets: { squat: [{}, {}] } }],
    ] satisfies Array<[string, Workout]>)('ignores a draft with %s', (_, workout) => {
      useWorkoutStore.setState({
        workouts: { 'routine-1': { startedAt: '2026-08-14T11:50:00Z', ...workout } },
      })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout')).toHaveAttribute('href', '/workout')
    })

    test('shows the running duration', () => {
      useWorkoutStore.setState({ workouts: { 'routine-1': inProgress() } })
      renderWithProviders(<AppNavBottom />, { route: '/home' })

      expect(tab('Workout').textContent).toMatch(/\d+[hm]/)
    })

    // The session already has a clock on its own screen.
    test('hides the duration on the workout screens', () => {
      useWorkoutStore.setState({ workouts: { 'routine-1': inProgress() } })
      renderWithProviders(<AppNavBottom />, { route: '/workouts/quick' })

      expect(tab('Workout')).toHaveTextContent('Workout')
    })
  })
})
