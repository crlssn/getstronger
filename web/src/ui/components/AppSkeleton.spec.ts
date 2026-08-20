// @vitest-environment jsdom

import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'

import { i18n } from '@/i18n'
import AppSkeleton from './AppSkeleton.vue'

const mountSkeleton = (props = {}) =>
  mount(AppSkeleton, { global: { plugins: [i18n] }, props })

describe('AppSkeleton', () => {
  test('renders a pulsating card with three lines by default', () => {
    const wrapper = mountSkeleton()

    expect(wrapper.get('.loading-card').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('.loading-line')).toHaveLength(3)
  })

  test('announces loading to screen readers', () => {
    expect(mountSkeleton().get('.sr-only').text()).toBe('Loading…')
  })

  test('renders as many lines as asked for', () => {
    expect(mountSkeleton({ lines: 5 }).findAll('.loading-line')).toHaveLength(5)
  })
})
