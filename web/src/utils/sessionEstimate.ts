// Eight minutes an exercise, and never a session that claims to be shorter
// than getting changed for it.
const minutesPerExercise = 8
const minimumMinutes = 30

/**
 * Roughly how long a session of this many exercises takes, in minutes.
 *
 * The home screen and the workout tab both put this figure on the card that
 * starts a routine, and two estimates of the same session disagreeing is worse
 * than either of them being wrong.
 */
export const estimatedSessionMinutes = (exerciseCount: number) =>
  Math.max(minimumMinutes, exerciseCount * minutesPerExercise)
