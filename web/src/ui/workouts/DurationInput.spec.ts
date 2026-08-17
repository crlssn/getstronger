// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'

import DurationInput from '@/ui/workouts/DurationInput.vue'

const type = async (wrapper: ReturnType<typeof mount>, value: string) => {
  const input = wrapper.get('input')
  await input.trigger('focus')
  await input.setValue(value)
  return input
}

describe('DurationInput', () => {
  test('parses digit-only entry as minutes and seconds filled from the right', async () => {
    const wrapper = mount(DurationInput)

    const input = await type(wrapper, '130')

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([90])
    // The text is left exactly as typed until the field is left, so the
    // formatter never rewrites characters underneath the cursor.
    expect(input.element.value).toBe('130')
  })

  test('parses colon notation', async () => {
    const wrapper = mount(DurationInput)

    await type(wrapper, '2:45')

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([165])
  })

  test('normalises the display when the field is left', async () => {
    const wrapper = mount(DurationInput, { props: { modelValue: undefined } })

    const input = await type(wrapper, '90')
    await wrapper.setProps({ modelValue: 90 })
    await input.trigger('blur')

    expect(input.element.value).toBe('1:30')
  })

  test('clearing the field clears the value', async () => {
    const wrapper = mount(DurationInput, { props: { modelValue: 90 } })

    await type(wrapper, '')

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]).toEqual([undefined])
  })

  test('shows a value copied in while the empty field has focus', async () => {
    // Focusing an empty set copies the previous session's value into the
    // model from outside the component; it must appear even mid-focus.
    const wrapper = mount(DurationInput, { props: { modelValue: undefined } })

    await wrapper.get('input').trigger('focus')
    await wrapper.setProps({ modelValue: 125 })

    expect(wrapper.get('input').element.value).toBe('2:05')
  })

  test('renders the initial value formatted', () => {
    const wrapper = mount(DurationInput, { props: { modelValue: 65 } })

    expect(wrapper.get('input').element.value).toBe('1:05')
  })
})
