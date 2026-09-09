import { Capacitor } from '@capacitor/core'

import { i18n } from '@/i18n'

/** Which workout a rest belongs to, so tapping the notification opens it. */
export interface RestNotificationTarget {
  routineID: string
  planID?: string
}

/**
 * One rest runs at a time, so one id is enough.
 *
 * Reusing it makes a rest that is extended replace the notification already on
 * the phone rather than leave a second one behind it.
 */
export const restNotificationId = 1

// Scheduling and cancelling both cross the bridge, so they are run in the order
// they were asked for: a cancel that overtook the schedule it undoes would
// leave a notification to fire for a rest that is over.
let bridge: Promise<unknown> = Promise.resolve()

const enqueue = (step: () => Promise<unknown>): void => {
  if (!Capacitor.isNativePlatform()) return

  bridge = bridge.then(step).catch((error: unknown) => {
    console.warn('rest notifications unavailable', error)
  })
}

/**
 * Whether the phone will show a rest notification.
 *
 * The prompt is asked for at the moment a rest is first scheduled, where the
 * reason for it is the screen the athlete is on, rather than at launch. A
 * refusal leaves the in-app banner as the only call-back, which is what a
 * browser gets too.
 */
const permitted = async (): Promise<boolean> => {
  const { LocalNotifications } = await import('@capacitor/local-notifications')

  const { display } = await LocalNotifications.checkPermissions()
  if (display === 'granted') return true
  if (display !== 'prompt' && display !== 'prompt-with-rationale') return false

  const requested = await LocalNotifications.requestPermissions()
  return requested.display === 'granted'
}

/**
 * Calls the athlete back when a rest ends with the app off screen.
 *
 * The deadline is absolute, so the OS holds it while the WebView is suspended —
 * which is where the in-app timer stops and this takes over. A no-op in a
 * browser.
 */
export const scheduleRestOver = (endsAtMs: number, target: RestNotificationTarget): void => {
  // A rest already over needs no notification, and the OS would deliver one
  // scheduled in the past immediately.
  if (endsAtMs <= Date.now()) return

  enqueue(async () => {
    if (!(await permitted())) return

    const { LocalNotifications } = await import('@capacitor/local-notifications')
    return LocalNotifications.schedule({
      notifications: [
        {
          id: restNotificationId,
          title: i18n.t('workout.restOverTitle'),
          body: i18n.t('workout.restOverBody'),
          schedule: { at: new Date(endsAtMs) },
          extra: target,
        },
      ],
    })
  })
}

/** Retires the pending rest notification, whichever way the rest ended. */
export const cancelRestOver = (): void => {
  enqueue(async () => {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    return LocalNotifications.cancel({ notifications: [{ id: restNotificationId }] })
  })
}
