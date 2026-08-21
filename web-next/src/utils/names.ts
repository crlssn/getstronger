// Avatar initials from a free-form name: first letter of the first and last
// word, so middle names and particles do not crowd the badge.
export const initials = (name?: string): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''

  const first = words[0].charAt(0)
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return `${first}${last}`.toLocaleUpperCase()
}

/**
 * Title-cases a name as it is typed: first letter of every word, and of every
 * part after a slash, so "bench press" becomes "Bench Press" and "pull/chin up"
 * becomes "Pull/Chin Up".
 */
export const titleCase = (value: string): string =>
  value.toLowerCase().replace(/(^\w|(?<=[ /])\w)/g, (char) => char.toUpperCase())
