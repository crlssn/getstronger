import type { Plugin } from 'chart.js'

import { inkColor, surfaceColor } from '@/ui/chartTokens'
import { formatNumber } from '@/utils/numbers'

const padX = 8
const padY = 4
const textSize = 11
const gap = 6

/**
 * Writes the most recent bar's value in an ink pill above it.
 *
 * It gives the chart a "today" story without a legend, and it draws straight to
 * the canvas, so nothing it writes shows up in the rendered DOM.
 */
export const latestValueLabel: Plugin<'bar'> = {
  id: 'latestValueLabel',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0)
    const bar = meta.data[meta.data.length - 1]
    if (!bar) return

    const raw = chart.data.datasets[0]?.data[meta.data.length - 1]
    // A trailing zero would float a "0" over the axis, which reads as a failed
    // session rather than as no session.
    if (typeof raw !== 'number' || raw <= 0) return

    const { ctx } = chart
    ctx.save()
    ctx.font = `700 ${textSize}px ${getComputedStyle(chart.canvas).fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    // The last bar sits at the right edge of the plot, so a centred pill runs
    // half its width past it and the canvas clips what hangs over — "8,293"
    // arrived as "8,2". Nudged back inside whichever edge it would cross.
    const label = formatNumber(raw)
    const half = ctx.measureText(label).width / 2 + padX
    const x = Math.min(Math.max(bar.x, chart.chartArea.left + half), chart.chartArea.right - half)

    const height = textSize + padY * 2
    const bottom = bar.y - gap

    ctx.fillStyle = inkColor()
    ctx.beginPath()
    // roundRect landed in every current browser; a canvas without it (an old
    // WebView, a test double) still gets the pill, square-cornered.
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x - half, bottom - height, half * 2, height, height / 2)
    } else {
      ctx.rect(x - half, bottom - height, half * 2, height)
    }
    ctx.fill()

    ctx.fillStyle = surfaceColor()
    ctx.fillText(label, x, bottom - padY + 1)
    ctx.restore()
  },
}
