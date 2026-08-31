import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * WCAG AA, measured rather than eyeballed, in both palettes.
 *
 * The pairs below are the text-on-fill combinations the modules actually
 * render — each one names the token that carries the words and the token
 * under them. The screenshot harness audits the same thing on the live pages;
 * this is the version that fails the moment a value in theme.css moves, with
 * the pair in the failure message instead of a page to go hunting through.
 */

// [text, fill, minimum] — 4.5 for body text, 3 for large text and icons.
const pairs: [string, string, number][] = [
  ['text', 'surface', 4.5],
  ['text', 'canvas', 4.5],
  ['text', 'surface-sunken', 4.5],
  ['text', 'ink-surface', 4.5],
  ['text', 'ink-tint', 4.5],
  ['text', 'surface-track', 4.5],
  ['text', 'info-surface', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'canvas', 4.5],
  ['text-muted', 'surface-sunken', 4.5],
  // The darkest thing this grey is read on, per the note in theme.css.
  ['text-muted', 'surface-track', 4.5],
  ['text-subtle', 'surface', 4.5],
  ['text-subtle', 'canvas', 4.5],
  ['text-subtle', 'surface-sunken', 4.5],
  ['text-inverse', 'ink', 4.5],
  ['text-inverse', 'ink-strong', 4.5],
  ['text-inverse', 'surface-inverse', 4.5],
  // The sheet's destructive action and the unread count both set inverse
  // text on a red fill.
  ['text-inverse', 'danger', 4.5],
  ['text-inverse', 'danger-strong', 4.5],
  ['text-inverse', 'badge', 4.5],
  ['text-inverse-muted', 'surface-inverse', 4.5],
  ['text-inverse-muted', 'ink', 4.5],
  ['ink', 'canvas', 4.5],
  ['ink', 'surface', 4.5],
  // Icons and the focus ring: non-text, so the 3:1 graphics floor.
  ['ink-muted', 'surface', 3],
  ['success', 'surface', 4.5],
  ['success-strong', 'success-surface', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'canvas', 4.5],
  ['danger', 'danger-surface', 4.5],
  ['danger-strong', 'danger-surface', 4.5],
  ['danger-strong', 'surface', 4.5],
  // The trophy on a record tint is a glyph, not a sentence.
  ['record', 'record-surface', 3],
  ['record-strong', 'record-surface', 4.5],
  // The personal-best set number, the darkest thing the gold is read on.
  ['record-strong', 'record-border', 4.5],
  ['record-strong', 'surface', 4.5],
  ['info', 'info-surface', 4.5],
]

type Palette = Record<string, string>

const theme = readFileSync(join(import.meta.dirname, '..', 'assets', 'theme.css'), 'utf8')

const palette = (block: string | undefined): Palette =>
  Object.fromEntries(
    [...(block ?? '').matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  )

const light = palette(/@theme static \{([^}]+)\}/.exec(theme)?.[1])
const dark = palette(/:root\[data-theme='dark'\] \{([^}]+)\}/.exec(theme)?.[1])

// A value is a hex colour or an `rgb(r g b / a)`; alpha is composited onto
// the fill before measuring, which is what the eye and the auditors both see.
const channels = (value: string): { alpha: number; rgb: [number, number, number] } => {
  const hex = /^#([0-9a-f]{6})$/.exec(value)
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(hex[1].slice(index, index + 2), 16) / 255)
    return { alpha: 1, rgb: [r, g, b] }
  }

  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(value)
  if (!rgb) throw new Error(`unreadable colour: ${value}`)
  return {
    alpha: Number(rgb[4]),
    rgb: [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255],
  }
}

const composite = (text: string, fill: string): [number, number, number] => {
  const over = channels(text)
  const under = channels(fill)
  return over.rgb.map(
    (channel, index) => channel * over.alpha + under.rgb[index] * (1 - over.alpha),
  ) as [number, number, number]
}

const luminance = ([r, g, b]: [number, number, number]): number => {
  const [red, green, blue] = [r, g, b].map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrast = (text: string, fill: string): number => {
  const [lighter, darker] = [luminance(composite(text, fill)), luminance(channels(fill).rgb)].sort(
    (a, b) => b - a,
  )
  return (lighter + 0.05) / (darker + 0.05)
}

describe.each([
  ['light', light],
  ['dark', dark],
])('the %s palette', (_, tokens) => {
  test.each(pairs)('%s on %s clears %s:1', (text, fill, minimum) => {
    expect(tokens[text], text).toBeDefined()
    expect(tokens[fill], fill).toBeDefined()
    expect(contrast(tokens[text], tokens[fill])).toBeGreaterThanOrEqual(minimum)
  })
})
