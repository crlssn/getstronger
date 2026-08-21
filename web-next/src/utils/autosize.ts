/**
 * Grows a textarea to fit its content.
 *
 * Safe as a `ref` callback and as an input handler: the height is reset before
 * it is measured, so the box shrinks back when text is deleted.
 */
export const autosize = (element: HTMLTextAreaElement | null) => {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}
