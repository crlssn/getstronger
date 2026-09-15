// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const haptics = vi.hoisted(() => ({ haptic: vi.fn() }))

vi.mock('@/native/haptics', () => haptics)

import { startPressHaptics } from './pressHaptics'

let stop: () => void

beforeEach(() => {
  haptics.haptic.mockReset()
  document.body.innerHTML = ''
  stop = startPressHaptics()
})

afterEach(() => {
  stop()
})

/** jsdom has no PointerEvent, and the listener only reads `target`. */
const pressOn = (element: Element) => {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
}

const render = (html: string): Element => {
  document.body.innerHTML = html
  const element = document.body.firstElementChild
  if (!element) throw new Error('nothing rendered')
  return element
}

describe('startPressHaptics', () => {
  test('answers a button', () => {
    pressOn(render('<button type="button">Finish</button>'))

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('press')
  })

  // Navigation is a press too: the design system draws a link with a button's
  // shape on purpose, so the two cannot feel different under a thumb.
  test('answers a link', () => {
    pressOn(render('<a href="/progress">Progress</a>'))

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('press')
  })

  // The icon inside a button is what the finger actually lands on.
  test('answers a press that lands on a control’s contents', () => {
    render('<button type="button"><svg><title>go</title></svg></button>')
    const icon = document.querySelector('svg')
    if (!icon) throw new Error('no icon')

    pressOn(icon)

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('press')
  })

  // The menu library renders its own items and the sheet its own dismiss, so
  // the role is as much a control as the tag is.
  test.each(['button', 'switch', 'tab', 'menuitem', 'option'])('answers role=%s', (role) => {
    pressOn(render(`<div role="${role}">Choice</div>`))

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('press')
  })

  test('ignores a disabled control', () => {
    pressOn(render('<button type="button" disabled>Save</button>'))

    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  test('ignores a control only marked disabled', () => {
    pressOn(render('<div role="button" aria-disabled="true">Save</div>'))

    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  // Typing is not pressing. A set table is mostly fields, and a buzz per
  // keystroke is the fastest way to make the whole thing feel broken.
  test('ignores a text field', () => {
    pressOn(render('<input type="text" />'))

    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  test('ignores the page behind the controls', () => {
    pressOn(render('<p>Nothing to press</p>'))

    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  // A control that handles its own gesture usually stops the event; capture is
  // what keeps it from silencing the phone as well.
  test('answers a press a handler swallows', () => {
    const button = render('<button type="button">Pick</button>')
    button.addEventListener('pointerdown', (event) => event.stopPropagation())

    pressOn(button)

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('press')
  })

  test('stops listening once torn down', () => {
    const button = render('<button type="button">Finish</button>')
    stop()

    pressOn(button)

    expect(haptics.haptic).not.toHaveBeenCalled()
  })
})
