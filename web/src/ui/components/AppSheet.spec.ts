// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import AppSheet from '@/ui/components/AppSheet.vue'

let wrapper: ReturnType<typeof mount<typeof AppSheet>> | undefined

const mountSheet = (
  props: Partial<InstanceType<typeof AppSheet>['$props']> & { title: string },
  slots: Record<string, string> = {},
) => {
  wrapper = mount(AppSheet, {
    attachTo: document.body,
    global: { plugins: [i18n] },
    props,
    slots,
  })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('AppSheet', () => {
  test('renders an accessible dialog labelled by its title', () => {
    const sheet = mountSheet({ title: 'Leave workout?' })

    const panel = sheet.get('[role="dialog"]')
    expect(panel.attributes('aria-modal')).toBe('true')
    const titleId = panel.get('h2').attributes('id')
    expect(titleId).toBeTruthy()
    expect(panel.attributes('aria-labelledby')).toBe(titleId)
    expect(panel.get('h2').text()).toBe('Leave workout?')
  })

  test('renders eyebrow, body, and the drag handle', () => {
    const sheet = mountSheet({
      body: 'Your progress is saved on this device.',
      eyebrow: 'Autosaved',
      eyebrowTone: 'success',
      title: 'Leave workout?',
    })

    expect(sheet.get('.sheet-eyebrow').text()).toBe('Autosaved')
    expect(sheet.get('.sheet-eyebrow').classes()).toContain('success')
    expect(sheet.get('.sheet-body').text()).toBe('Your progress is saved on this device.')
    expect(sheet.get('.sheet-handle').attributes('aria-hidden')).toBe('true')
  })

  test('omits eyebrow, body, close button, and empty regions when not provided', () => {
    const sheet = mountSheet({ title: 'Add exercise' })

    expect(sheet.find('.sheet-eyebrow').exists()).toBe(false)
    expect(sheet.find('.sheet-body').exists()).toBe(false)
    expect(sheet.find('.sheet-close').exists()).toBe(false)
    expect(sheet.find('.sheet-content').exists()).toBe(false)
    expect(sheet.find('.sheet-actions').exists()).toBe(false)
  })

  test('renders slotted content and actions', () => {
    const sheet = mountSheet(
      { title: 'Add exercise' },
      {
        actions: '<button type="button" class="primary">Save</button>',
        default: '<ul class="options"><li>Bench press</li></ul>',
      },
    )

    expect(sheet.get('.sheet-content .options').text()).toBe('Bench press')
    expect(sheet.get('.sheet-actions button').text()).toBe('Save')
  })

  test('closes from the labelled close button', async () => {
    const sheet = mountSheet({ closeLabel: 'Close exercise picker', title: 'Add exercise' })

    const close = sheet.get('.sheet-close')
    expect(close.attributes('aria-label')).toBe('Close exercise picker')
    await close.trigger('click')
    expect(sheet.emitted('close')).toHaveLength(1)
  })

  test('closes on backdrop click but not on panel click', async () => {
    const sheet = mountSheet({ title: 'Leave workout?' })

    await sheet.get('.sheet-panel').trigger('click')
    expect(sheet.emitted('close')).toBeUndefined()

    await sheet.get('.sheet-backdrop').trigger('click')
    expect(sheet.emitted('close')).toHaveLength(1)
  })

  test('closes on Escape', () => {
    const sheet = mountSheet({ title: 'Leave workout?' })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(sheet.emitted('close')).toHaveLength(1)
  })
})
