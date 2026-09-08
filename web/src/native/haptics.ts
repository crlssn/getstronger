import { Capacitor } from '@capacitor/core'

// The deadline of the last rest the phone spoke for: the shell banner and the
// workout screen both watch a rest, and can both see it run out in one tick.
let lastRestOver: number | undefined

/**
 * Buzzes the phone for a rest that has run out.
 *
 * The one moment in a workout where the app asks for attention rather than
 * receives it, and the athlete is looking at the room rather than the screen.
 * The OS success pattern is a two-beat that reads as an announcement, where a
 * single impact reads as a tap acknowledged. Once per deadline, whoever asks,
 * and a no-op in a browser.
 */
export const vibrateRestOver = (endsAtMs: number): void => {
  if (!Capacitor.isNativePlatform()) return
  if (lastRestOver === endsAtMs) return
  lastRestOver = endsAtMs

  void import('@capacitor/haptics')
    .then(({ Haptics, NotificationType }) =>
      Haptics.notification({ type: NotificationType.Success }),
    )
    .catch((error: unknown) => {
      console.warn('haptics unavailable', error)
    })
}
