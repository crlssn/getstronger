/**
 * Mints a v4 UUID, and keeps minting one where the platform cannot.
 *
 * `crypto.randomUUID` arrived in Chrome 92, but `minSdkVersion` is 24 and an
 * Android device that never updated its System WebView is stuck years behind
 * that. On one such WebView the missing method threw where a workout is
 * started, taking the screen down with it. `getRandomValues` has been there
 * since Chrome 11, so the fallback reaches every WebView that runs the app.
 */
export const randomUUID = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // Version 4.
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // Variant 1.

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
