// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { warmLazyRoutes } from './warmRoutes'

describe('warmLazyRoutes', () => {
  test('imports every lazy route component up front', async () => {
    const home = vi.fn().mockResolvedValue({ template: '<div />' })
    const detail = vi.fn().mockResolvedValue({ template: '<div />' })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { component: home, path: '/home' },
        { component: detail, path: '/detail' },
      ],
    })

    await warmLazyRoutes(router)

    expect(home).toHaveBeenCalledTimes(1)
    expect(detail).toHaveBeenCalledTimes(1)
  })

  test('survives a component that fails to load', async () => {
    const broken = vi.fn().mockRejectedValue(new Error('offline'))
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ component: broken, path: '/broken' }],
    })

    await expect(warmLazyRoutes(router)).resolves.toBeUndefined()
  })
})
