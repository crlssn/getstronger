import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Findings, PageRecord } from './paths'

// The harness already counts what a screenshot cannot show: pages that scroll
// sideways, controls under a fingertip, text under 12px, clipped text and axe
// violations. Counting them is only half the job — without a number to compare
// against, the totals drift back up one screen at a time. This is that number,
// and the run fails when one of them goes up.

const budgetPath = fileURLToPath(new URL('./budget.json', import.meta.url))

type Budget = Record<keyof Findings, number>

const empty = (): Budget => ({
  accessibility: 0,
  clippedText: 0,
  horizontalOverflow: 0,
  smallTapTargets: 0,
  tinyText: 0,
})

export const count = (records: PageRecord[]): Budget => {
  const counts = empty()

  for (const record of records) {
    for (const [finding, values] of Object.entries(record.findings ?? {})) {
      counts[finding as keyof Findings] += values.length
    }
  }

  return counts
}

// Reported rather than thrown, so the caller can print the whole picture before
// deciding the run failed.
export const compare = async (records: PageRecord[]) => {
  const { budget } = JSON.parse(await readFile(budgetPath, 'utf8')) as { budget: Budget }
  const counted = count(records)
  const entries = Object.keys(counted).sort() as (keyof Findings)[]

  return {
    counted,
    improved: entries.filter((finding) => counted[finding] < budget[finding]),
    lines: entries.map(
      (finding) =>
        `${finding.padEnd(19)} ${String(counted[finding]).padStart(3)}  of ${budget[finding]}`,
    ),
    regressed: entries.filter((finding) => counted[finding] > budget[finding]),
  }
}
