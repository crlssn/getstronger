/**
 * Appends a page of results, skipping anything the list already holds.
 *
 * A page can arrive twice for the same token. React runs an effect twice in
 * development precisely to surface that, and a scroll sentinel can fire again
 * before the first response lands. Appending blindly then duplicates every row,
 * which React reports as two children with the same key — and which the reader
 * sees as the same entry listed twice.
 *
 * A page with nothing new in it returns the list it was given, so a duplicate
 * response costs no render either.
 */
export const appendPage = <T extends { id: string }>(current: T[], page: readonly T[]): T[] => {
  const seen = new Set(current.map((entry) => entry.id))
  const fresh = page.filter((entry) => !seen.has(entry.id))

  return fresh.length ? [...current, ...fresh] : current
}

/**
 * Lays a fresh first page over a list that already holds several.
 *
 * The rows after it survive when the page still reaches them — its last row is
 * one the list holds. Otherwise the list has moved on past what it held, and
 * this returns undefined: the caller starts again from the page.
 */
export const refreshFirstPage = <T extends { id: string }>(
  current: T[],
  page: readonly T[],
): T[] | undefined => {
  const last = page.at(-1)
  const end = last ? current.findIndex((entry) => entry.id === last.id) : -1
  if (end < 0) return undefined

  const fresh = new Set(page.map((entry) => entry.id))
  return [...page, ...current.slice(end + 1).filter((entry) => !fresh.has(entry.id))]
}
