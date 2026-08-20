// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'

import AppOptionalAction from '@/ui/components/AppOptionalAction.vue'

describe('AppOptionalAction', () => {
  test('renders the label with a plus icon and emits click', async () => {
    const action = mount(AppOptionalAction, { props: { label: 'Add exercise' } })

    const button = action.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.text()).toBe('Add exercise')
    expect(button.find('svg').exists()).toBe(true)
    expect(action.find('small').exists()).toBe(false)

    await button.trigger('click')
    expect(action.emitted('click')).toHaveLength(1)
  })

  test('renders the optional hint under the label', () => {
    const action = mount(AppOptionalAction, {
      props: { hint: 'Only for this workout', label: 'Add exercise' },
    })

    expect(action.get('strong').text()).toBe('Add exercise')
    expect(action.get('small').text()).toBe('Only for this workout')
  })
})
