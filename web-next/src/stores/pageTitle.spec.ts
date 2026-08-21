import { beforeEach, describe, expect, test } from 'vitest'

import { usePageTitleStore } from './pageTitle'

describe('usePageTitleStore', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'GetStronger' })
  })

  test('falls back to the product name', () => {
    expect(usePageTitleStore.getState().pageTitle).toBe('GetStronger')
  })

  test('takes the title the route supplies', () => {
    usePageTitleStore.getState().setPageTitle('Exercises')

    expect(usePageTitleStore.getState().pageTitle).toBe('Exercises')
  })
})
