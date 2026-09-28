import Foundation
#if os(iOS)
import ActivityKit
#endif

// What a recording's Live Activity shows, compiled into the app and into the
// widget extension that draws it.
//
// Every clock is a date for `Text(timerInterval:)` to count from, so the
// seconds run on the Lock Screen without an update each one, and every word
// arrives from the web app already in the athlete's language.

/// One interval as the Lock Screen names it; an open one has no length.
struct LiveInterval {
    let instruction: String
    let seconds: Double?
}

/// One hold on the recording, in milliseconds since 1970; an open one has no end.
struct LivePause {
    let startedAt: Double
    let endedAt: Double?
}

/// The Live Activity's content state.
struct LiveSessionState: Codable, Hashable {
    var instruction: String
    /// Where the interval began, moved on by every pause since the session did.
    var intervalStart: Date
    /// Where it ends on the same terms; nil for an open interval, which counts up.
    var intervalEnd: Date?
    /// Where the session began, moved on by every pause, so it counts active time.
    var sessionStart: Date
    /// Where the clocks stopped, while the recording is held.
    var pausedAt: Date?
    /// The pace as the live screen writes it, once there is ground enough for one.
    var pace: String?
}

/// The words the Live Activity shows, handed over once when it is raised.
struct LiveSessionLabels: Codable, Hashable {
    let paused: String
    let intervalLeft: String
    let total: String
    let pace: String
    /// Shown once updates have stopped arriving, which is an app that was killed.
    let stopped: String
}

/// How often an unchanged state is shown again, which moves its stale date on.
let liveRenewSeconds = 60.0
/// How long a state stands before the Lock Screen reads it as abandoned.
let liveStaleSeconds = 180.0
/// How often a new pace alone is worth showing, as `paceRefreshMs` on the web.
let livePaceRefreshSeconds = 5.0

/// The recording at `time` as the Lock Screen shows it, or nothing once its
/// last interval is over.
///
/// A held recording is read where the hold began, so its state stands still
/// until the hold is lifted.
func liveSessionState(intervals: [LiveInterval], startedAt: Double, pauses: [LivePause],
                      at time: Double) -> LiveSessionState? {
    let held = pauses.last.flatMap { $0.endedAt == nil ? $0.startedAt : nil }
    let at = held ?? time
    let paused = pauses.reduce(0) { $0 + (($1.endedAt ?? at) - $1.startedAt) }
    let sessionStart = startedAt + paused
    let elapsed = at - sessionStart
    var opened = 0.0
    for interval in intervals {
        let length = interval.seconds.map { $0 * 1000 } ?? .infinity
        if elapsed < opened + length {
            let start = sessionStart + opened
            return LiveSessionState(
                instruction: interval.instruction, intervalStart: date(start),
                intervalEnd: interval.seconds.map { date(start + $0 * 1000) },
                sessionStart: date(sessionStart), pausedAt: held.map(date), pace: nil)
        }
        opened += length
    }
    return nil
}

private func date(_ milliseconds: Double) -> Date { Date(timeIntervalSince1970: milliseconds / 1000) }

/// Seconds per kilometre over the ground measured, or nothing short of the floor.
func measuredPace(metres: Double, seconds: Double, floorMetres: Double) -> Double? {
    metres > 0 && metres >= floorMetres ? seconds / metres * 1000 : nil
}

/// A pace as `paceIn` in `web/src/utils/exerciseMeasurements.ts` writes it.
func paceLabel(secondsPerKilometre: Double, unit: String) -> String {
    let perUnit = Int((unit == "mi" ? secondsPerKilometre * 1.609344 : secondsPerKilometre).rounded())
    return "\(perUnit / 60):\(String(format: "%02d", perUnit % 60)) /\(unit)"
}

/// Whether `next` is worth an update over the state on show.
///
/// A new interval or a pause is shown at once; a pace, which moves with every
/// fix, no faster than the live screen refreshes its own.
func worthShowing(_ next: LiveSessionState, over shown: LiveSessionState?, secondsSince: Double) -> Bool {
    guard let shown, secondsSince < liveRenewSeconds else { return true }
    var unpaced = next
    unpaced.pace = shown.pace
    if unpaced != shown { return true }
    return next.pace != shown.pace && secondsSince >= livePaceRefreshSeconds
}

/// A gym workout's Live Activity content state: the clock counts up from the
/// first logged set, and a rest counts down while one runs.
struct LiveWorkoutState: Codable, Hashable {
    var exercise: String
    var startedAt: Date
    var rest: ClosedRange<Date>?
}

/// The words a gym workout's Live Activity shows, handed over once when it is raised.
struct LiveWorkoutLabels: Codable, Hashable {
    let elapsed: String
    let rest: String
    /// Shown once updates have stopped arriving, which is an app that was killed.
    let stopped: String
}

/// How long a gym workout's state stands before it reads as abandoned.
///
/// The app is suspended between sets, so updates arrive only as sets are
/// logged; half an hour without one is a workout nobody is keeping.
let liveWorkoutStaleSeconds = 30 * 60.0

/// The workout at `time` as the Lock Screen shows it, from the web app's
/// clocks in milliseconds since 1970.
func liveWorkoutState(exercise: String, startedAt: Double, restEndsAt: Double?, restSeconds: Double?,
                      at time: Double) -> LiveWorkoutState {
    let rest = restEndsAt.flatMap { end -> ClosedRange<Date>? in
        guard end > time else { return nil }
        let length = (restSeconds ?? 0) * 1000
        return date(length > 0 ? end - length : time)...date(end)
    }
    return LiveWorkoutState(exercise: exercise, startedAt: date(startedAt), rest: rest)
}

#if os(iOS)
@available(iOS 16.1, *)
struct LiveSessionAttributes: ActivityAttributes {
    typealias ContentState = LiveSessionState
    let labels: LiveSessionLabels
    /// Where a tap on the activity opens the app.
    let link: URL?
}

@available(iOS 16.1, *)
struct LiveWorkoutAttributes: ActivityAttributes, Hashable {
    typealias ContentState = LiveWorkoutState
    /// The draft the activity belongs to, so ending one leaves another alone.
    let key: String
    let name: String
    let labels: LiveWorkoutLabels
    let link: URL?
}
#endif
