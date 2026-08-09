import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

import { backDestinationFor } from './backDestination'
import { en, sv } from '@/i18n/messages'

const route = (
  name: string,
  path: string,
  params: Record<string, string> = {},
): Pick<RouteLocationNormalizedLoaded, 'name' | 'params' | 'path'> => ({ name, params, path })

describe('backDestinationFor', () => {
  it.each([
    ['progress', '/progress', {}, '/profile'],
    ['list-notifications', '/notifications', {}, '/profile'],
    ['view-workout', '/workouts/workout-1', { id: 'workout-1' }, '/workout'],
    ['edit-workout', '/workouts/workout-1/edit', { id: 'workout-1' }, '/workouts/workout-1'],
    ['create-plan', '/plans/create', {}, '/plans'],
    ['plan', '/plans/plan-1', { id: 'plan-1' }, '/plans'],
    ['edit-plan', '/plans/plan-1/edit', { planId: 'plan-1' }, '/plans/plan-1'],
    ['create-routine', '/routines/create', {}, '/routines'],
    ['routine', '/routines/routine-1', { id: 'routine-1' }, '/routines'],
    ['edit-routine', '/routines/routine-1/edit', { id: 'routine-1' }, '/routines/routine-1'],
    ['create-exercise', '/exercises/create', {}, '/exercises'],
    ['view-exercise', '/exercises/exercise-1', { id: 'exercise-1' }, '/exercises'],
    [
      'update-exercise',
      '/exercises/exercise-1/edit',
      { id: 'exercise-1' },
      '/exercises/exercise-1',
    ],
    ['signup', '/signup', {}, '/login'],
  ])('maps %s to its canonical parent', (name, path, params, expectedPath) => {
    expect(backDestinationFor(route(name, path, params)).path).toBe(expectedPath)
  })

  it('returns from a public-profile subpage to that public profile', () => {
    expect(
      backDestinationFor(route('user-view', '/users/user-1/followers', { id: 'user-1' })).path,
    ).toBe('/users/user-1')
  })

  it('returns from the public-profile overview to home', () => {
    expect(backDestinationFor(route('user-view', '/users/user-1', { id: 'user-1' })).path).toBe(
      '/home',
    )
  })

  it('falls back to home rather than browser history', () => {
    expect(backDestinationFor(route('not-found', '/unknown')).path).toBe('/home')
  })

  it('sends the routines list up to training rather than to itself', () => {
    expect(backDestinationFor(route('routines', '/routines')).path).toBe('/plans')
  })

  it('never returns the route it was given', () => {
    const routes = [
      route('progress', '/progress'),
      route('list-notifications', '/notifications'),
      route('routines', '/routines'),
      route('routine', '/routines/routine-1', { id: 'routine-1' }),
      route('view-exercise', '/exercises/exercise-1', { id: 'exercise-1' }),
      route('user-view', '/users/user-1/followers', { id: 'user-1' }),
    ]

    for (const current of routes) {
      expect(backDestinationFor(current).path).not.toBe(current.path)
    }
  })

  it('names every destination with a translatable key', () => {
    const names = [
      'progress',
      'list-notifications',
      'user-view',
      'edit-workout',
      'view-workout',
      'create-plan',
      'edit-plan',
      'routines',
      'create-routine',
      'edit-routine',
      'create-exercise',
      'update-exercise',
      'signup',
      'not-found',
    ]

    for (const name of names) {
      const { labelKey } = backDestinationFor(route(name, `/${name}`, { id: 'x', planId: 'y' }))
      expect(labelKey).toMatch(/^nav\.back\.[a-z]+$/)
      expect(en.nav.back).toHaveProperty(labelKey.replace('nav.back.', ''))
      expect(sv.nav.back).toHaveProperty(labelKey.replace('nav.back.', ''))
    }
  })
})
