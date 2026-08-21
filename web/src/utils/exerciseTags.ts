export const maxTags = 10
export const maxTagLength = 64
const maxSuggestions = 8

/** Why a candidate tag was turned away, or `undefined` if it was accepted. */
export type TagRejection =
  { reason: 'tooLong' } | { reason: 'duplicate'; tag: string } | { reason: 'tooMany' }

export interface AppendResult {
  tags: string[]
  /** The last thing that went wrong, which is what the field reports. */
  rejection?: TagRejection
}

const lower = (value: string) => value.toLowerCase()

/**
 * Suggestions matching what has been typed, best first.
 *
 * A tag that starts with the query comes before one that merely contains it,
 * because that is the one the typist is most likely reaching for.
 */
export const matchingSuggestions = (
  suggestions: readonly string[],
  selected: readonly string[],
  draft: string,
): string[] => {
  const query = lower(draft.trim())
  if (!query || selected.length >= maxTags) return []

  const taken = new Set(selected.map(lower))

  return suggestions
    .filter((tag) => !taken.has(lower(tag)) && lower(tag).includes(query))
    .sort((left, right) => {
      const leftLeads = lower(left).startsWith(query)
      if (leftLeads !== lower(right).startsWith(query)) return leftLeads ? -1 : 1
      return left.localeCompare(right)
    })
    .slice(0, maxSuggestions)
}

/**
 * Adds candidate tags to the selection, skipping the ones it cannot take.
 *
 * A candidate matching an existing suggestion adopts that suggestion's casing,
 * so the same tag does not end up spelled two ways across exercises.
 */
export const appendTags = (
  selected: readonly string[],
  candidates: readonly string[],
  suggestions: readonly string[] = [],
): AppendResult => {
  const tags = [...selected]
  const taken = new Set(tags.map(lower))
  let rejection: TagRejection | undefined

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed) continue

    const tag = suggestions.find((suggestion) => lower(suggestion) === lower(trimmed)) ?? trimmed

    if (tag.length > maxTagLength) {
      rejection = { reason: 'tooLong' }
      continue
    }
    if (taken.has(lower(tag))) {
      rejection = { reason: 'duplicate', tag }
      continue
    }
    if (tags.length >= maxTags) {
      rejection = { reason: 'tooMany' }
      break
    }

    taken.add(lower(tag))
    tags.push(tag)
  }

  return { tags, rejection }
}

/** Splits typed input on commas, so a pasted list arrives as separate tags. */
export const splitCandidates = (draft: string): string[] =>
  draft
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
