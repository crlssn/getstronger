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

// A username as every view shows it. An empty username stays empty rather than
// rendering a lone '@' while a profile is still loading.
export const handle = (username?: string): string => {
  const trimmed = (username ?? '').trim()
  return trimmed ? `@${trimmed}` : ''
}

const usernameMaxLength = 30
const usernameMinLength = 3

// A username suggested from a name during signup. Accents fold to the letter
// they sit on rather than being dropped, and anything the username pattern
// refuses goes, so the suggestion always satisfies the field it lands in. Too
// short to be valid means no suggestion at all.
export const usernameFromName = (name?: string): string => {
  const suggestion = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, usernameMaxLength)

  return suggestion.length < usernameMinLength ? '' : suggestion
}
