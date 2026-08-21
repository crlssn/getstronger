import type { Plugin } from 'chart.js'

import { successColor } from '@/ui/chartTokens'
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
    ctx.fillStyle = successColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(formatNumber(raw), bar.x, bar.y - 4)
    ctx.restore()
  },
}
