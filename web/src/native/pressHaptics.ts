import { haptic } from '@/native/haptics'

// What reads as a control under a finger. Roles as well as tags, because the
// design system is not the only thing that draws one: the menu library renders
// its own items, the sheet its own dismiss, and four screens carry a bare
// button with the reason written above it.
const PRESSABLE = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(',')

/** The control a press landed on, or nothing if it landed on the page. */
const pressedControl = (target: EventTarget | null): Element | undefined => {
  if (!(target instanceof Element)) return undefined

  // The finger lands on the icon or the label, not on the button around it.
  const control = target.closest(PRESSABLE)
  if (!control) return undefined

  // A disabled control does nothing, so it should feel like nothing. `:disabled`
  // is only ever true of a form element, which is why the ARIA flag is checked
  // too — that is how a div with a role says the same thing.
  if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') {
    return undefined
  }

  return control
}

/**
 * Buzzes the phone for every control a finger goes down on. Returns a teardown.
 *
 * One delegated listener rather than a prop threaded through forty components.
 * The design system is the rule for what a screen may render, not for what
 * ends up in the document: a menu library brings its own buttons and a screen
 * with a good reason brings its own too, so anything built from a list of
 * components would have been short of a control on the day it was written.
 *
 * `pointerdown` rather than `click`, because a native control answers the
 * touch and not the release — the phone confirming a press a tenth of a second
 * after the finger lands is most of what makes a web app feel like one.
 */
export const startPressHaptics = (): (() => void) => {
  const onPointerDown = (event: Event) => {
    if (pressedControl(event.target)) haptic('press')
  }

  // Capture: a control that handles its own gesture usually stops the event,
  // and that should not be the same as silencing the phone. Passive, because
  // this never cancels the press it is only acknowledging.
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })

  return () => {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }
}
