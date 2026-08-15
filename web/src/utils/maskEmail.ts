// The mask never grows past this so that a long address cannot push the notice
// off a narrow screen, and so that the length of the address is not disclosed.
const maxMaskLength = 8

// maskEmail hides the local part of an address while keeping the domain
// readable, so that the pending verification notice can show where the email
// went without exposing the account on a shared device. An address that cannot
// be masked returns an empty string, and callers fall back to generic wording.
export const maskEmail = (email: string): string => {
  const separator = email.lastIndexOf('@')
  if (separator <= 0) return ''

  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  if (domain === '' || !domain.includes('.')) return ''

  if (local.length === 1) return `•@${domain}`
  if (local.length === 2) return `${local[0]}•@${domain}`

  const mask = '•'.repeat(Math.min(local.length - 2, maxMaskLength))
  return `${local[0]}${mask}${local[local.length - 1]}@${domain}`
}
