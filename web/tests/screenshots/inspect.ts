import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Findings } from './paths'

// Measurements a screenshot cannot show. They are leads for a design review
// rather than assertions: a page that scrolls sideways, a control smaller than
// a fingertip, or text the layout cuts off is worth looking at first.

const minimumTapTarget = 44
const minimumFontSize = 12
const perFinding = 10

export const inspect = async (page: Page, viewportWidth: number): Promise<Findings> => {
  const measurements = await page.evaluate(
    ({ limit, minimumSize, minimumText, width }) => {
      // Identity deliberately leaves out the id and the text: a list renders the
      // same control once per row, and reporting each row separately would fill
      // the finding with copies of one design decision.
      const selector = (element: Element) => {
        const classes =
          typeof element.className === 'string'
            ? element.className
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => `.${name}`)
                .join('')
            : ''
        return `${element.tagName.toLowerCase()}${classes}`
      }

      const textOf = (element: Element) =>
        (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)

      const isVisible = (element: Element) => {
        const { height, width: elementWidth } = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          height > 0 &&
          elementWidth > 0 &&
          style.display !== 'none' &&
          style.opacity !== '0' &&
          style.visibility !== 'hidden'
        )
      }

      const hasOwnText = (element: Element) =>
        Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
        )

      const elements = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(
        isVisible,
      )
      const documentWidth = document.documentElement.scrollWidth

      // Off-canvas drawers legitimately sit outside the viewport, so elements
      // are only named once the document itself scrolls sideways.
      const horizontalOverflow =
        documentWidth > width + 1
          ? elements
              .filter((element) => element.getBoundingClientRect().right > width + 1)
              .map((element) => ({
                element,
                measurement: `reaches ${Math.round(element.getBoundingClientRect().right)}px of ${width}px`,
              }))
          : []

      const smallTapTargets = elements
        .filter((element) => element.matches('a, button, input, select, summary, [role="button"]'))
        // A link inside a sentence is exempt from the target-size guideline and
        // would otherwise drown out the controls that are genuinely too small.
        .filter((element) => getComputedStyle(element).display !== 'inline')
        .filter((element) => {
          const { height, width: elementWidth } = element.getBoundingClientRect()
          return height < minimumSize || elementWidth < minimumSize
        })
        .map((element) => {
          const { height, width: elementWidth } = element.getBoundingClientRect()
          return {
            element,
            measurement: `${Math.round(elementWidth)}×${Math.round(height)}px`,
          }
        })

      const tinyText = elements
        .filter(hasOwnText)
        .filter((element) => parseFloat(getComputedStyle(element).fontSize) < minimumText)
        .map((element) => ({ element, measurement: getComputedStyle(element).fontSize }))

      // Ellipsis is a deliberate choice; a hard clip usually is not.
      const clippedText = elements
        .filter(hasOwnText)
        .filter((element) => {
          const style = getComputedStyle(element)
          return (
            style.textOverflow !== 'ellipsis' &&
            ['clip', 'hidden'].includes(style.overflowX) &&
            element.scrollWidth > element.clientWidth + 1 &&
            // A one-pixel box is a label hidden for screen readers, not a clip.
            element.clientWidth > 4
          )
        })
        .map((element) => ({
          element,
          measurement: `${element.scrollWidth}px of content in ${element.clientWidth}px`,
        }))

      // One line per design decision, however many rows repeat it.
      const group = (matches: { element: Element; measurement: string }[]) => {
        const counts = new Map<string, { count: number; text: string }>()

        for (const { element, measurement } of matches) {
          const key = `${selector(element)} — ${measurement}`
          const seen = counts.get(key)
          counts.set(key, { count: (seen?.count ?? 0) + 1, text: seen?.text ?? textOf(element) })
        }

        return Array.from(counts.entries())
          .slice(0, limit)
          .map(([key, { count, text }]) => {
            const example = text ? ` "${text}"` : ''
            if (count === 1) return `${key}${example}`
            return `${key} — ${count} elements${example ? `, e.g.${example}` : ''}`
          })
      }

      return {
        clippedText: group(clippedText),
        horizontalOverflow: group(horizontalOverflow),
        smallTapTargets: group(smallTapTargets),
        tinyText: group(tinyText),
      }
    },
    {
      limit: perFinding,
      minimumSize: minimumTapTarget,
      minimumText: minimumFontSize,
      width: viewportWidth,
    },
  )

  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  return {
    ...measurements,
    accessibility: audit.violations
      .map(({ help, id, nodes }) => `${id} — ${help} (${nodes.length} nodes)`)
      .slice(0, perFinding),
  }
}
