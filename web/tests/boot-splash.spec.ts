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

// Everything outside the reduced-motion block, and the block itself. The two
// declare the same selectors and say opposite things about them.
const reducedMotionBlock =
  /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {6}\}/.exec(css)?.[1] ?? ''
// Comments sit between the rules, and a selector reads as itself without them.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
const fullMotion = withoutComments(css.replace(reducedMotionBlock, ''))

const declarationsFor = (selector: string, source = fullMotion) => {
  const rule = [...withoutComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(
    ([, selectors]) =>
      selectors
        .split(',')
        .map((one) => flat(one))
        .includes(selector),
  )
  return flat(rule?.[2] ?? '')
}

const keyframes = (name: string) =>
  flat(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n {6}\\}`).exec(css)?.[1] ?? '')

// theme.css has not loaded yet when the splash paints, so the splash restates
// the handful of values it needs. This reads them back out of the token layer,
// which is the only thing that keeps the two from drifting apart.
const token = (name: string) => {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(theme)?.[1]
  if (!value) throw new Error(`theme.css declares no --${name}`)
  return flat(value)
}

// Three plates a side, loaded heaviest first so that a plate never slides
// through the one already on the bar.
const plates = ['p1', 'p2', 'p3'] as const

// A keyframe track, read back as the stops it is written as: the percentage
// the plate is at, and how far off the collar it sits.
const stops = (name: string) =>
  [
    ...keyframes(name).matchAll(/([\d.%, ]+)\{\s*transform: translateX\((-?[\d.]+)(?:px)?\)/g),
  ].flatMap(([, percentages, offset]) =>
    percentages
      .split(',')
      .filter((percentage) => percentage.trim())
      .map((percentage) => ({ at: parseFloat(percentage), offset: parseFloat(offset) })),
  )

// Seated is within the collar's own couple of pixels: the plate lands with a
// shove into the collar before it settles, and that shove is still seated.
const seated = (offset: number) => Math.abs(offset) <= 2
const loadedAt = (name: string) => stops(name).find((stop) => seated(stop.offset))?.at
const strippedAt = (name: string) => {
  const track = stops(name)
  const landing = track.findIndex((stop) => seated(stop.offset))
  return track.slice(landing).find((stop) => !seated(stop.offset))?.at
}

describe('boot splash', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  it('loads a bar under the brand', () => {
    expect(document.querySelector('#boot-splash .boot-barbell svg')).not.toBeNull()
  })

  it('hangs three plates on each end', () => {
    expect(document.querySelectorAll('#boot-splash .boot-plate-l')).toHaveLength(plates.length)
    expect(document.querySelectorAll('#boot-splash .boot-plate-r')).toHaveLength(plates.length)
  })

  it('slides every plate on from off the bar and takes it off again', () => {
    for (const side of ['l', 'r'] as const)
      for (const plate of plates) {
        const track = stops(`load-${side}${plate.slice(1)}`)
        expect(track.length).toBeGreaterThan(0)
        expect(seated(track[0].offset)).toBe(false)
        expect(seated(track[track.length - 1].offset)).toBe(false)
        expect(track.some((stop) => stop.offset === 0)).toBe(true)
      }
  })

  it('loads the two ends towards one another', () => {
    for (const plate of plates) {
      const left = stops(`load-l${plate.slice(1)}`)[0].offset
      const right = stops(`load-r${plate.slice(1)}`)[0].offset
      expect(left).toBeLessThan(0)
      expect(right).toBe(-left)
    }
  })

  // The one thing that keeps the animation honest: a plate that loaded before
  // another has to come off after it, or the two slide through one another.
  it('loads heaviest first and strips lightest first', () => {
    const loads = plates.map((plate) => loadedAt(`load-l${plate.slice(1)}`))
    const strips = plates.map((plate) => strippedAt(`load-l${plate.slice(1)}`))
    expect(loads).toEqual([...loads].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(strips).toEqual([...strips].sort((a, b) => (b ?? 0) - (a ?? 0)))
  })

  it('dips the bar as each pair lands', () => {
    const dips = [
      ...keyframes('bar-dip').matchAll(/([\d.]+)% \{ transform: translateY\(([\d.]+)px/g),
    ]
    expect(dips.map(([, at]) => parseFloat(at))).toEqual(
      plates.map((plate) => loadedAt(`load-l${plate.slice(1)}`)),
    )
    for (const [, , drop] of dips) expect(parseFloat(drop)).toBeGreaterThan(0)
  })

  it('runs the bar and its plates off one clock', () => {
    const duration = /(\d+(?:\.\d+)?s)/.exec(declarationsFor('#boot-splash .boot-rig'))?.[1]
    expect(duration).toBeDefined()
    expect(declarationsFor('#boot-splash .boot-plate-l')).toContain(duration)
    expect(declarationsFor('#boot-splash .boot-plate-r')).toContain(duration)
  })

  it('restates the theme it cannot wait for', () => {
    expect(declarationsFor('#boot-splash')).toContain(`background: ${token('color-canvas')}`)
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

  // The plates wear the bar's own ink, so the rig reads as one piece.
  it('draws every plate in the same ink as the bar', () => {
    expect(declarationsFor('#boot-splash .boot-steel')).toContain(`fill: ${token('color-ink')}`)
    for (const plate of plates)
      expect(declarationsFor(`#boot-splash .${plate}`)).toContain(`fill: ${token('color-ink')}`)
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
      '#boot-splash .boot-brand',
      '#boot-splash .boot-mark',
      '#boot-splash .boot-copy',
    ])
      expect(declarationsFor(selector)).not.toMatch(/animation/)
  })

  // A start that beats the splash should never flash it, so it fades in on a
  // delay rather than painting with the document.
  it('waits a beat before showing itself', () => {
    const splash = declarationsFor('#boot-splash')
    expect(splash).toMatch(/opacity: 0/)
    expect(splash).toMatch(/animation: boot-reveal [\d.]+m?s [a-z-]+ 0\.[1-9]\d*s forwards/)
    expect(keyframes('boot-reveal')).toContain('opacity: 1')
  })

  it('parks the bar loaded for a reader who asked for less motion', () => {
    for (const selector of [
      '#boot-splash .boot-rig',
      '#boot-splash .boot-plate-l',
      '#boot-splash .boot-plate-r',
    ])
      expect(declarationsFor(selector, reducedMotionBlock)).toMatch(/animation: none/)
    // Still revealed, or the splash would be a blank page.
    expect(declarationsFor('#boot-splash', reducedMotionBlock)).toMatch(/animation-duration/)
  })
})
