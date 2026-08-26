import type { Plugin } from 'chart.js'

import { inkColor } from '@/ui/chartTokens'
import { formatNumber } from '@/utils/numbers'

/**
 * Writes the most recent bar's value above it.
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
    ctx.font = `700 11px ${getComputedStyle(chart.canvas).fontFamily}`
    ctx.fillStyle = inkColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    // The last bar sits at the right edge of the plot, so a centred label runs
    // half its width past it and the canvas clips what hangs over — "8,293"
    // arrived as "8,2". Nudged back inside whichever edge it would cross.
    const label = formatNumber(raw)
    const half = ctx.measureText(label).width / 2
    const x = Math.min(Math.max(bar.x, chart.chartArea.left + half), chart.chartArea.right - half)

    ctx.fillText(label, x, bar.y - 4)
    ctx.restore()
  },
}
