import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { brandName, brandNameParts, brandSlogan } from '../src/brand'

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

// Every rule the selector is written in, joined: the splash states a lockup's
// layout and its materials separately, and both are the same element.
const declarationsFor = (selector: string, source = fullMotion) =>
  flat(
    [...withoutComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) =>
        selectors
          .split(',')
          .map((one) => flat(one))
          .includes(selector),
      )
      .map(([, , declarations]) => flat(declarations))
      .join(' '),
  )

const keyframes = (name: string) =>
  flat(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n {6}\\}`).exec(css)?.[1] ?? '')

// theme.css has not loaded yet when the splash paints, so the splash restates
// the handful of values it needs. This reads them back out of the token layer,
// which is the only thing that keeps the two from drifting apart.
const palettes = {
  dark: theme.slice(theme.indexOf(":root[data-theme='dark']")),
  light: theme.slice(0, theme.indexOf(":root[data-theme='dark']")),
}
const token = (name: string, palette: keyof typeof palettes = 'light') => {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(palettes[palette])?.[1]
  if (!value) throw new Error(`theme.css declares no --${name} in the ${palette} palette`)
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

// The window a slogan word holds the cell for: fully in, then fully out again.
const shows = (name: string) => {
  const track = [...keyframes(name).matchAll(/([\d.%, ]+)\{\s*opacity: ([\d.]+)/g)].flatMap(
    ([, percentages, opacity]) =>
      percentages
        .split(',')
        .filter((percentage) => percentage.trim())
        .map((percentage) => ({ at: parseFloat(percentage), opacity: parseFloat(opacity) })),
  )
  const entrance = track.findIndex((stop) => stop.opacity === 1)
  return {
    from: track[entrance]?.at,
    until: track.slice(entrance).find((stop) => stop.opacity === 0)?.at,
  }
}

describe('boot splash', () => {
  const document = new DOMParser().parseFromString(html, 'text/html')

  // Each plate is a group — a moulded body, its hairline and the lit face —
  // and the body is the piece that says where the plate seats.
  const plateBodies = (side: 'l' | 'r') =>
    [...document.querySelectorAll(`#boot-splash .boot-plate-${side} .boot-rubber`)].map((rect) => {
      const from = parseFloat(rect.getAttribute('x') ?? '')
      return { from, to: from + parseFloat(rect.getAttribute('width') ?? '') }
    })

  it('frames the wordmark in the bar', () => {
    const lockup = document.querySelector('#boot-splash .boot-lockup')
    expect(lockup?.querySelector('svg')).not.toBeNull()
    expect(lockup?.querySelector('.boot-wordmark')).not.toBeNull()
    expect(lockup?.querySelector('.boot-slogan')).not.toBeNull()
  })

  it('hangs three plates on each end', () => {
    expect(document.querySelectorAll('#boot-splash .boot-plate-l')).toHaveLength(plates.length)
    expect(document.querySelectorAll('#boot-splash .boot-plate-r')).toHaveLength(plates.length)
  })

  // Rubber plates are stacked flush on a real bar, so each overlaps the one
  // before it rather than floating a sliver of daylight away from it.
  it('stacks every plate flush against its neighbour', () => {
    for (const side of ['l', 'r'] as const) {
      const bodies = plateBodies(side).sort((a, b) => a.from - b.from)
      const overlaps = bodies.slice(1).map((body, at) => bodies[at].to - body.from)
      expect(overlaps[0]).toBeGreaterThan(0)
      for (const overlap of overlaps) expect(overlap).toBe(overlaps[0])
    }
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

  it('runs the bar, its plates and the slogan off one clock', () => {
    const duration = /(\d+(?:\.\d+)?s)/.exec(declarationsFor('#boot-splash .boot-rig'))?.[1]
    expect(duration).toBeDefined()
    for (const selector of [
      '#boot-splash .boot-plate-l',
      '#boot-splash .boot-plate-r',
      '#boot-splash .boot-slogan span',
    ])
      expect(declarationsFor(selector)).toContain(duration)
  })

  // One word per pair of plates: it arrives as they land, and hands the cell
  // over before the next one arrives, so the line never reads as two words.
  it('brings in a word as each pair lands', () => {
    const words = ['word-1', 'word-2', 'word-3'].map((word) => shows(word))
    for (const [at, word] of words.entries()) {
      expect(word.from).toBeGreaterThanOrEqual(loadedAt(`load-l${at + 1}`) ?? 0)
      expect(word.until).toBeGreaterThan(word.from ?? 0)
    }
    // Each word has handed the cell back before the next one takes it.
    for (const [at, word] of words.slice(1).entries())
      expect(word.from).toBeGreaterThanOrEqual(words[at].until ?? 0)
    // The last word is gone before the bar is bare, not after it.
    expect(words[2].until).toBeLessThanOrEqual(strippedAt('load-l1') ?? 0)
  })

  it('restates the theme it cannot wait for', () => {
    expect(declarationsFor('#boot-splash')).toContain(`background: ${token('color-canvas')}`)
    expect(declarationsFor('#boot-splash .boot-lockup')).toContain(`color: ${token('color-text')}`)
    expect(declarationsFor("[data-theme='dark'] #boot-splash")).toContain(
      `background: ${token('color-canvas', 'dark')}`,
    )
    expect(declarationsFor("[data-theme='dark'] #boot-splash .boot-lockup")).toContain(
      `color: ${token('color-text', 'dark')}`,
    )
  })

  // Chrome on the bar, rubber on the plates: two stacks of stops that the dark
  // palette re-values rather than redraws.
  it('turns the bar in chrome and moulds the plates in rubber', () => {
    expect(declarationsFor('#boot-splash .boot-steel')).toContain('fill: url(#boot-steel)')
    expect(declarationsFor('#boot-splash .boot-rubber')).toContain('fill: url(#boot-rubber)')
    for (const material of ['steel', 'rubber']) {
      const stack = [
        ...declarationsFor('#boot-splash').matchAll(new RegExp(`--boot-${material}-\\w+:`, 'g')),
      ].map(([stop]) => stop)
      expect(stack).toHaveLength(6)
      for (const stop of stack)
        expect(declarationsFor("[data-theme='dark'] #boot-splash")).toContain(stop)
    }
  })

  // The splash cannot import from src, so it restates the lockup by hand.
  // These two keep the copy from drifting away from the guest header's.
  it('reads exactly as the guest header does', () => {
    expect(document.querySelector('#boot-splash .boot-wordmark')?.textContent).toBe(brandName)
    const words = [...document.querySelectorAll('#boot-splash .boot-slogan span')].map(
      (word) => word.textContent?.trim() ?? '',
    )
    expect(`${words.join('. ')}.`).toBe(brandSlogan)
  })

  it('splits the name across the two weights the guest header uses', () => {
    expect(document.querySelector('#boot-splash .boot-wordmark span')?.textContent).toBe(
      brandNameParts[0],
    )
    expect(declarationsFor('#boot-splash .boot-wordmark')).toMatch(/font-weight: 700/)
    expect(declarationsFor('#boot-splash .boot-wordmark span')).toMatch(/font-weight: 600/)
  })

  // The wordmark only sits between the collars, and the slogan only under the
  // shaft, at the width the lockup was drawn at. Every offset is a share of
  // that width rather than a fixed pixel, so a narrow phone shrinks the whole
  // lockup instead of sliding the words off the bar.
  it('scales the lockup as one piece', () => {
    const lockup = declarationsFor('#boot-splash .boot-lockup')
    expect(lockup).toContain('container-type: inline-size')
    const unit = /--boot-px:\s*([\d.]+)cqw/.exec(lockup)?.[1]
    expect(parseFloat(unit ?? '0') * 320).toBe(100)
    for (const selector of ['#boot-splash .boot-wordmark', '#boot-splash .boot-slogan']) {
      const rule = declarationsFor(selector)
      expect(rule).toMatch(/top: calc\([\d.]+ \* var\(--boot-px\)\)/)
      expect(rule).toMatch(/font-size: calc\([\d.]+ \* var\(--boot-px\)\)/)
    }
  })

  it('leaves the wordmark still', () => {
    for (const selector of ['#boot-splash .boot-lockup', '#boot-splash .boot-wordmark'])
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

  it('parks the bar loaded on the last word for a reader who asked for less motion', () => {
    for (const selector of [
      '#boot-splash .boot-rig',
      '#boot-splash .boot-plate-l',
      '#boot-splash .boot-plate-r',
      '#boot-splash .boot-slogan span',
    ])
      expect(declarationsFor(selector, reducedMotionBlock)).toMatch(/animation: none/)
    expect(declarationsFor('#boot-splash .boot-slogan .w3', reducedMotionBlock)).toMatch(
      /opacity: 1/,
    )
    // Still revealed, or the splash would be a blank page.
    expect(declarationsFor('#boot-splash', reducedMotionBlock)).toMatch(/animation-duration/)
  })
})
