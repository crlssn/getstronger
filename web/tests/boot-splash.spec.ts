import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { brandNameParts, brandSlogan } from '../src/brand'

// The boot splash lives in index.html so that it paints before any JavaScript
// runs, which puts it out of reach of every component test. This is its cover.

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''

const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

describe('boot splash', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  it('shows a progress bar under the brand', () => {
    expect(document.querySelector('#boot-splash .boot-progress')).not.toBeNull()
  })

  // The splash cannot import from src, so it restates the lockup by hand.
  // These two keep the copy from drifting away from the guest header's.
  it('reads exactly as the guest header does', () => {
    const copy = document.querySelector('#boot-splash .boot-brand')?.textContent
    expect(copy?.replace(/\s+/g, ' ').trim()).toBe(`${brandNameParts.join('')} ${brandSlogan}`)
  })

  it('splits the name across the two weights the guest header uses', () => {
    expect(declarationsFor('#boot-splash .boot-copy strong')).toMatch(/font-weight:\s*700/)
    expect(declarationsFor('#boot-splash .boot-copy strong span')).toMatch(/font-weight:\s*600/)
  })

  it('swings the bar back and forth forever, the wait having no known length', () => {
    expect(declarationsFor('#boot-splash .boot-progress span')).toMatch(
      /animation:[^;]*\binfinite\b[^;]*\balternate\b/,
    )
  })

  it('leaves the brand itself still', () => {
    for (const selector of [
      '#boot-splash',
      '#boot-splash .boot-brand',
      '#boot-splash .boot-mark',
      '#boot-splash .boot-copy',
    ])
      expect(declarationsFor(selector)).not.toMatch(/animation/)
  })

  it('holds the bar still for a reader who asked for less motion', () => {
    const reducedMotion = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {6}\}/.exec(css)
    expect(reducedMotion?.[1]).toContain('.boot-progress')
    expect(reducedMotion?.[1]).toMatch(/animation:\s*none/)
  })
})
