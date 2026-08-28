// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'

import { latestValueLabel } from './latestValueLabel'

// The hook reads four fields off the chart; a real Chart cannot be built
// without a canvas context jsdom does not implement.
const draw = latestValueLabel.afterDatasetsDraw as unknown as (chart: unknown) => void

describe('latestValueLabel', () => {
  // jsdom measures no text, so the label is given a width the test controls.
  const drawOn = (
    bars: { x: number; y: number }[],
    values: unknown[],
    chartArea = { left: 0, right: 1000 },
    labelWidth = 0,
  ) => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      measureText: () => ({ width: labelWidth }),
    }
    const chart = {
      ctx,
      chartArea,
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

    expect(ctx.fillText).toHaveBeenCalledWith('2,500', 30, 31)
  })

  test('draws the pill the value sits in', () => {
    const ctx = drawOn([{ x: 30, y: 40 }], [2500])

    expect(ctx.fill).toHaveBeenCalled()
  })

  // The last bar sits at the right edge of the plot, so a centred label ran
  // half its width past it and the canvas clipped the overhang: "8,293"
  // arrived as "8,2".
  test('keeps the label inside the plot at the right edge', () => {
    const ctx = drawOn([{ x: 300, y: 40 }], [8293], { left: 0, right: 300 }, 40)

    expect(ctx.fillText).toHaveBeenCalledWith('8,293', 272, 31)
  })

  test('keeps it inside at the left edge too', () => {
    const ctx = drawOn([{ x: 0, y: 40 }], [8293], { left: 0, right: 300 }, 40)

    expect(ctx.fillText).toHaveBeenCalledWith('8,293', 28, 31)
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
