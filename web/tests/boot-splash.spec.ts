import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { brandNameParts, brandSlogan } from '../src/brand'

// The boot splash lives in index.html so that it paints before any JavaScript
// runs, which puts it out of reach of every component test. This is its cover.

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
const theme = readFileSync(join(__dirname, '..', 'src', 'assets', 'theme.css'), 'utf8')

// Collapsed, because the formatter is free to break a long value across lines
// and a rule reads the same either way.
const flat = (value: string) => value.replace(/\s+/g, ' ').trim()

const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return flat(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '')
}

// theme.css has not loaded yet when the splash paints, so the splash restates
// the handful of values it needs. This reads them back out of the token layer,
// which is the only thing that keeps the two from drifting apart.
const token = (name: string) => {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(theme)?.[1]
  if (!value) throw new Error(`theme.css declares no --${name}`)
  return flat(value)
}

// The sprite is a strip of frames behind a window one frame wide, so the count
// has to agree in three places: the drawing, the window, and the step.
const frames = 6

describe('boot splash', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  it('lifts under the brand', () => {
    expect(document.querySelector('#boot-splash .boot-lifter svg')).not.toBeNull()
  })

  it('draws every frame of the lift', () => {
    expect(document.querySelectorAll('#boot-splash .boot-lifter .boot-frame')).toHaveLength(frames)
  })

  it('shows one frame at a time', () => {
    expect(declarationsFor('#boot-splash .boot-lifter')).toMatch(/overflow:\s*hidden/)
  })

  it('draws the lifter in strokes rather than pixels', () => {
    const stroke = declarationsFor('#boot-splash .boot-lifter path')
    expect(stroke).toMatch(/stroke-linecap:\s*round/)
    expect(stroke).toMatch(/stroke-linejoin:\s*round/)
    expect(css).not.toMatch(/crispEdges/)
  })

  // A limb crossing the body is laid on paper of its own. That paper is the
  // splash's background, so the two have to be the same colour.
  it('lays a crossing limb on paper of the splash’s own colour', () => {
    expect(declarationsFor('#boot-splash .boot-arm-behind')).toContain(
      `stroke: ${token('color-surface-sunken')}`,
    )
    expect(declarationsFor('#boot-splash .boot-plate-behind')).toContain(
      `fill: ${token('color-surface-sunken')}`,
    )
  })

  it('restates the theme it cannot wait for', () => {
    expect(declarationsFor('#boot-splash')).toContain(
      `background: ${token('color-surface-sunken')}`,
    )
    expect(declarationsFor('#boot-splash .boot-mark')).toContain(
      `background: ${token('color-ink')}`,
    )
    expect(declarationsFor('#boot-splash .boot-mark')).toContain(token('color-ink-border'))
    expect(declarationsFor('#boot-splash .boot-copy > span')).toContain(
      `color: ${token('color-text-subtle')}`,
    )
    expect(declarationsFor('#boot-splash .boot-ground')).toContain(
      `fill: ${token('color-ink-border')}`,
    )
  })

  it('cuts from frame to frame rather than sliding between them', () => {
    expect(declarationsFor('#boot-splash .boot-lifter svg')).toMatch(
      new RegExp(`animation:[^;]*\\bsteps\\(${frames}\\)[^;]*\\binfinite\\b`),
    )
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

  it('leaves the brand itself still', () => {
    for (const selector of [
      '#boot-splash',
      '#boot-splash .boot-brand',
      '#boot-splash .boot-mark',
      '#boot-splash .boot-copy',
    ])
      expect(declarationsFor(selector)).not.toMatch(/animation/)
  })

  it('holds the lift still for a reader who asked for less motion', () => {
    const reducedMotion = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {6}\}/.exec(css)
    expect(reducedMotion?.[1]).toContain('.boot-lifter')
    expect(reducedMotion?.[1]).toMatch(/animation:\s*none/)
  })
})
