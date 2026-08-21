// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { i18n } from '@/i18n'
import { renderWithProviders } from '@/ui/testing'
import { RichMessage } from './RichMessage'

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('RichMessage', () => {
  test('puts the element where the placeholder was', () => {
    const { container } = renderWithProviders(
      <RichMessage i18nKey="notifications.followedYou" nodes={{ name: <strong>alex</strong> }} />,
    )

    expect(container).toHaveTextContent('alex followed you')
    expect(screen.getByText('alex').tagName).toBe('STRONG')
  })

  test('takes string placeholders alongside the elements', () => {
    const { container } = renderWithProviders(
      <RichMessage
        i18nKey="notifications.commentedOnUsersWorkout"
        values={{ owner: 'sam' }}
        nodes={{ name: <strong>alex</strong>, workout: <strong>Leg day</strong> }}
      />,
    )

    expect(container).toHaveTextContent('alex commented on sam’s Leg day workout')
  })

  // The point of interpolating rather than concatenating: the translator
  // decides where each name lands, and Swedish does not put them where English
  // does.
  test('follows the translated word order', async () => {
    await i18n.changeLanguage('sv')
    const { container } = renderWithProviders(
      <RichMessage i18nKey="notifications.followedYou" nodes={{ name: <strong>alex</strong> }} />,
    )

    expect(container.textContent).toBe('alex började följa dig')
  })

  test('renders a message with no placeholders at all', () => {
    const { container } = renderWithProviders(
      <RichMessage i18nKey="notifications.empty" nodes={{}} />,
    )

    expect(container).toHaveTextContent('Your notifications will appear here')
  })
})
