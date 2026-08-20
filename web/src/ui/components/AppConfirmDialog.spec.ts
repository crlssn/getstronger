// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useConfirmationStore } from '@/stores/confirmation'
import AppConfirmDialog from '@/ui/components/AppConfirmDialog.vue'

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

// The dialog portals to the body, so it is asserted through the document
// rather than the wrapper.
const dialogPanel = () => document.querySelector('.dialog-panel')

const click = (element: Element | null) => {
  expect(element).toBeTruthy()
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  return flushPromises()
}

describe('AppConfirmDialog', () => {
  let wrapper: VueWrapper

  beforeEach(() => {
    setActivePinia(createPinia())
    wrapper = mount(AppConfirmDialog, { global: { plugins: [i18n] } })
  })

  afterEach(() => {
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  test('resolves true when the confirm button is pressed', async () => {
    const confirmationStore = useConfirmationStore()
    const confirmed = confirmationStore.confirm({
      body: 'This cannot be undone.',
      confirmLabel: 'Delete workout',
      destructive: true,
      title: 'Delete “Leg day”?',
    })
    await flushPromises()

    expect(dialogPanel()?.textContent).toContain('Delete “Leg day”?')
    expect(dialogPanel()?.textContent).toContain('This cannot be undone.')

    const confirmButton = document.querySelector('.dialog-confirm')
    expect(confirmButton?.classList.contains('destructive')).toBe(true)
    await click(confirmButton)

    await expect(confirmed).resolves.toBe(true)
    expect(dialogPanel()).toBeNull()
  })

  test('blurs the focused input so the mobile keyboard retracts', async () => {
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    const confirmationStore = useConfirmationStore()
    const confirmed = confirmationStore.confirm({
      confirmLabel: 'Discard workout',
      title: 'Discard “Leg day”?',
    })
    await flushPromises()

    expect(document.activeElement).not.toBe(input)
    confirmationStore.dismiss()
    await expect(confirmed).resolves.toBe(false)
  })

  test('resolves false when cancelled with the default label', async () => {
    const confirmationStore = useConfirmationStore()
    const confirmed = confirmationStore.confirm({
      confirmLabel: 'Pause',
      title: 'Pause this plan?',
    })
    await flushPromises()

    const cancelButton = document.querySelector('.dialog-cancel')
    expect(cancelButton?.textContent).toContain('Cancel')
    await click(cancelButton)

    await expect(confirmed).resolves.toBe(false)
    expect(dialogPanel()).toBeNull()
  })
})
