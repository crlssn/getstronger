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
