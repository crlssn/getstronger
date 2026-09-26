import { beforeEach, describe, expect, test } from 'vitest'

import { selectPreviousTitle, usePageTitleStore } from './pageTitle'

describe('usePageTitleStore', () => {
  beforeEach(() => {
    usePageTitleStore.setState({
      pageTitle: 'GetStronger',
      pageTitleKey: '',
      idx: 0,
      titles: {},
    })
  })

  test('falls back to the product name', () => {
    expect(usePageTitleStore.getState().pageTitle).toBe('GetStronger')
  })

  test('takes the title the route supplies', () => {
    usePageTitleStore.getState().setPageTitle('Exercises')

    expect(usePageTitleStore.getState().pageTitle).toBe('Exercises')
  })

  // The key travels rather than the string it resolves to, so a language
  // chosen while the screen is open renames the header with it.
  test('keeps the key a route arrived with', () => {
    usePageTitleStore.getState().enterPage('pages.exercises')

    expect(usePageTitleStore.getState().pageTitleKey).toBe('pages.exercises')
    expect(usePageTitleStore.getState().pageTitle).toBe('')
  })

  // What the back row is named after: the title of the history entry before
  // this one, rather than whichever screen the last navigation left.
  describe('the entry before this one', () => {
    const previous = () => selectPreviousTitle(usePageTitleStore.getState())

    test('is the screen a push left behind', () => {
      usePageTitleStore.getState().enterPage('pages.exercises')
      usePageTitleStore.getState().arrive(0)
      usePageTitleStore.getState().enterPage('pages.viewExercise')
      usePageTitleStore.getState().arrive(1)

      expect(previous()).toEqual({ title: '', key: 'pages.exercises' })
    })

    // A screen sets its own title once it has fetched what it is about, and
    // that is the name the next screen's back row should carry.
    test('takes the name a screen gave itself', () => {
      usePageTitleStore.getState().enterPage('pages.viewExercise')
      usePageTitleStore.getState().arrive(0)
      usePageTitleStore.getState().setPageTitle('Bench press')
      usePageTitleStore.getState().enterPage('pages.viewWorkout')
      usePageTitleStore.getState().arrive(1)

      expect(previous()).toEqual({ title: 'Bench press', key: '' })
    })

    // Exercises → Bench press → a workout → back: on Bench press, back goes to
    // Exercises, and the row used to name the workout just left.
    test('is not the screen a pop left behind', () => {
      const { enterPage, arrive } = usePageTitleStore.getState()
      enterPage('pages.exercises')
      arrive(0)
      enterPage('pages.viewExercise')
      arrive(1)
      enterPage('pages.viewWorkout')
      arrive(2)
      enterPage('pages.viewExercise')
      arrive(1)

      expect(previous()).toEqual({ title: '', key: 'pages.exercises' })
    })

    // A replace rewrites the entry in place: a form saved with replace is no
    // longer anywhere back can go.
    test('forgets a screen a replace wrote over', () => {
      const { enterPage, arrive } = usePageTitleStore.getState()
      enterPage('pages.routines')
      arrive(0)
      enterPage('pages.createRoutine')
      arrive(1)
      enterPage('pages.viewRoutine')
      arrive(1)
      enterPage('pages.editRoutine')
      arrive(2)

      expect(previous()).toEqual({ title: '', key: 'pages.viewRoutine' })
    })

    // Opened from a link or after a reload, there is nothing before it on
    // record, and the header falls back to the tab.
    test('is absent when nothing was recorded there', () => {
      usePageTitleStore.getState().arrive(3)

      expect(previous()).toBeUndefined()
    })
  })
})
