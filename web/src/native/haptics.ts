import { Capacitor } from '@capacitor/core'

/**
 * What just happened, rather than how strongly to buzz.
 *
 * The vocabulary lives here so a screen says what it did and this module
 * answers how that feels. A call site free to pick an impact style is how one
 * moment ends up with five answers and the whole app stops meaning anything.
 */
export type HapticIntent =
  'press' | 'selection' | 'setCompleted' | 'personalBest' | 'actionFailed' | 'restOver'

// Gestures storm: a thumb on a stepper, two listeners on one tap. Two buzzes
// closer together than this are a single sensation anyway, so the second is
// only a queue forming behind the first. The fastest deliberate tapping is
// around 100ms apart, which leaves room to spare.
const COALESCE_MS = 50

// Announcements are the opposite: rare, deduped by whoever raises them, and
// the one the athlete is waiting for. A tap that happened to precede one must
// never swallow it.
const GESTURES: ReadonlySet<HapticIntent> = new Set<HapticIntent>([
  'press',
  'selection',
  'setCompleted',
])

// Fetched once and kept. A logged workout is hundreds of presses, and
// re-entering the module graph for each one is the backlog itself.
let bridge: Promise<typeof import('@capacitor/haptics')> | undefined

let lastGestureAt = 0

/**
 * Buzzes the phone for something that just happened, and no-ops in a browser.
 *
 * Never awaited: the phone answering a finger is not something a screen waits
 * on, and a plugin that is missing or refused is a missing sensation rather
 * than a failed action.
 */
export const haptic = (intent: HapticIntent): void => {
  if (!Capacitor.isNativePlatform()) return

  if (GESTURES.has(intent)) {
    const now = Date.now()
    if (now - lastGestureAt < COALESCE_MS) return
    lastGestureAt = now
  }

  bridge ??= import('@capacitor/haptics')
  void bridge
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      switch (intent) {
        case 'press':
          return Haptics.impact({ style: ImpactStyle.Light })
        case 'selection':
          return Haptics.selectionChanged()
        // The app's most repeated action, and the one a hand feels for without
        // looking, so it lands heavier than the tap that opened a menu.
        case 'setCompleted':
          return Haptics.impact({ style: ImpactStyle.Medium })
        case 'personalBest':
        case 'restOver':
          return Haptics.notification({ type: NotificationType.Success })
        case 'actionFailed':
          return Haptics.notification({ type: NotificationType.Error })
      }
    })
    .catch((error: unknown) => {
      console.warn('haptics unavailable', error)
    })
}

// The deadline of the last rest the phone spoke for: the shell banner and the
// workout screen both watch a rest, and can both see it run out in one tick.
let lastRestOver: number | undefined

/**
 * Buzzes the phone for a rest that has run out.
 *
 * The one moment in a workout where the app asks for attention rather than
 * receives it, and the athlete is looking at the room rather than the screen.
 * The OS success pattern is a two-beat that reads as an announcement, where a
 * single impact reads as a tap acknowledged. Once per deadline, whoever asks.
 */
export const vibrateRestOver = (endsAtMs: number): void => {
  if (lastRestOver === endsAtMs) return
  lastRestOver = endsAtMs

  haptic('restOver')
}
