// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { create } from '@bufbuild/protobuf'

import { i18n } from '@/i18n'
import { ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { useAlertStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import ViewExercise from '@/ui/exercises/ViewExercise.vue'

const { deleteExercise, getExercise, listSets, routerPush } = vi.hoisted(() => ({
  deleteExercise: vi.fn(),
  getExercise: vi.fn(),
  listSets: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/http/requests', () => ({
  deleteExercise,
  getExercise,
  listSets,
}))

vi.mock('@/router/router', () => ({
  default: { push: routerPush },
}))

// Headless UI's dialog observes its panel for resizes; jsdom has no
// ResizeObserver, so give it an inert one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    disconnect() {}
    observe() {}
    unobserve() {}
  },
)

const ownerID = 'user-owner'
const exercise = create(ExerciseSchema, {
  id: 'exercise-1',
  name: 'Bench Press',
  userId: ownerID,
})

const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { component: { template: '<div />' }, name: 'exercises', path: '/exercises' },
      { component: ViewExercise, name: 'view-exercise', path: '/exercises/:id' },
      {
        component: { template: '<div />' },
        name: 'update-exercise',
        path: '/exercises/:id/edit',
      },
    ],
  })

// The overflow menu teleports into the page header's action slot, so it and
// the delete sheet are asserted through the document rather than the wrapper.
const headerAction = () => document.querySelector('#page-nav-action')

const menuButton = () =>
  document.querySelector<HTMLButtonElement>(
    '#page-nav-action button[aria-label="Exercise actions"]',
  )

const dialogPanel = () => document.querySelector('.sheet-panel')

const click = (element: Element | null) => {
  expect(element).toBeTruthy()
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  return flushPromises()
}

describe('ViewExercise', () => {
  let router: Router
  let wrapper: VueWrapper | undefined

  beforeEach(async () => {
    setActivePinia(createPinia())
    document.body.innerHTML = '<div id="page-nav-action"></div>'
    getExercise.mockResolvedValue({ exercise })
    listSets.mockResolvedValue({ pagination: undefined, sets: [] })
    deleteExercise.mockReset()
    routerPush.mockReset()
    router = createTestRouter()
    await router.push(`/exercises/${exercise.id}`)
  })

  afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ''
  })

  const mountView = async (userID: string) => {
    useAuthStore().userId = userID
    wrapper = mount(ViewExercise, {
      attachTo: document.body,
      global: { plugins: [i18n, router] },
    })
    await flushPromises()
    return wrapper
  }

  const openDeleteDialog = async () => {
    await click(menuButton())
    const deleteItem = [...document.querySelectorAll('#page-nav-action .menu-item')].find(
      (item) => item.textContent?.trim() === 'Delete exercise',
    )
    await click(deleteItem ?? null)
  }

  test('keeps management out of the content and offers it from the header menu', async () => {
    await mountView(ownerID)

    expect(wrapper!.find('.manage-card').exists()).toBe(false)
    expect(menuButton()).toBeTruthy()

    await click(menuButton())
    const items = [...document.querySelectorAll('#page-nav-action .menu-item')].map((item) =>
      item.textContent?.trim(),
    )
    expect(items).toEqual(['Update exercise', 'Delete exercise'])

    const editLink = document.querySelector('#page-nav-action a.menu-item')
    expect(editLink?.getAttribute('href')).toBe(`/exercises/${exercise.id}/edit`)
  })

  test('hides the management menu from non-owners', async () => {
    await mountView('user-visitor')

    expect(headerAction()?.childElementCount).toBe(0)
  })

  test('explains the effect of deletion and cancels without deleting', async () => {
    await mountView(ownerID)
    await openDeleteDialog()

    expect(dialogPanel()).toBeTruthy()
    expect(dialogPanel()?.textContent).toContain('Delete “Bench Press”?')
    expect(dialogPanel()?.textContent).toContain(
      'The exercise is removed from your library and from every routine that includes it. ' +
        'Sets you have already logged are kept in your workout history. ' +
        'This cannot be undone in the app.',
    )

    await click(document.querySelector('.dialog-cancel'))

    expect(dialogPanel()).toBeNull()
    expect(deleteExercise).not.toHaveBeenCalled()
  })

  test('deletes after confirmation and reports success', async () => {
    deleteExercise.mockResolvedValue({})
    await mountView(ownerID)
    await openDeleteDialog()

    await click(document.querySelector('.dialog-delete'))

    expect(deleteExercise).toHaveBeenCalledWith(exercise.id)
    expect(useAlertStore().alert).toMatchObject({ message: 'Exercise deleted', type: 'success' })
    expect(routerPush).toHaveBeenCalledWith('/exercises')
    expect(dialogPanel()).toBeNull()
  })

  test('reports a failed deletion and stays on the page', async () => {
    deleteExercise.mockResolvedValue(undefined)
    await mountView(ownerID)
    await openDeleteDialog()

    await click(document.querySelector('.dialog-delete'))

    expect(deleteExercise).toHaveBeenCalledWith(exercise.id)
    expect(useAlertStore().alert).toMatchObject({
      message: 'The exercise could not be deleted. Try again.',
      type: 'error',
    })
    expect(routerPush).not.toHaveBeenCalled()
    expect(dialogPanel()).toBeNull()
  })
})
