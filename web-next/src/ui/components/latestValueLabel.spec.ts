// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'

import { latestValueLabel } from './latestValueLabel'

// The hook reads four fields off the chart; a real Chart cannot be built
// without a canvas context jsdom does not implement.
const draw = latestValueLabel.afterDatasetsDraw as unknown as (chart: unknown) => void

describe('latestValueLabel', () => {
  const drawOn = (bars: { x: number; y: number }[], values: unknown[]) => {
    const ctx = { save: vi.fn(), restore: vi.fn(), fillText: vi.fn() }
    const chart = {
      ctx,
      // A real element: the label copies the canvas's font family off it.
      canvas: document.createElement('canvas'),
      data: { datasets: [{ data: values }] },
      getDatasetMeta: () => ({ data: bars }),
    }

    draw(chart)
    return ctx
  }

  test('writes the last value above the last bar', () => {
    const ctx = drawOn(
      [
        { x: 10, y: 90 },
        { x: 30, y: 40 },
      ],
      [1000, 2500],
    )

    expect(ctx.fillText).toHaveBeenCalledWith('2,500', 30, 36)
  })

  // A trailing zero would print a "0" floating over the axis, which reads as a
  // failed session rather than as no session.
  test.each([
    ['no bars', [], []],
    ['a zero value', [{ x: 10, y: 90 }], [0]],
    ['a missing value', [{ x: 10, y: 90 }], [undefined]],
  ])('draws nothing for %s', (_case, bars, values) => {
    expect(drawOn(bars, values).fillText).not.toHaveBeenCalled()
  })
})
