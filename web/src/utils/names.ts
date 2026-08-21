// Avatar initials from a free-form name: first letter of the first and last
// word, so middle names and particles do not crowd the badge.
export const initials = (name?: string): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''

  const first = words[0].charAt(0)
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return `${first}${last}`.toLocaleUpperCase()
}
