import ActivityKit
import SwiftUI
import WidgetKit

@main
struct LiveSessionWidgets: WidgetBundle {
    var body: some Widget {
        LiveSessionWidget()
        LiveWorkoutWidget()
    }
}

/// A live session on the Lock Screen and in the Dynamic Island.
///
/// Nothing here is written in English: the instruction and the labels arrive
/// in the athlete's language, and the clocks are numbers.
struct LiveSessionWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveSessionAttributes.self) { context in
            LockScreen(context: context)
                .padding()
                .widgetURL(context.attributes.link)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                // Inset from the island's rounded ends, which otherwise clip
                // the first and last characters.
                DynamicIslandExpandedRegion(.leading) {
                    Text(state.instruction).font(.headline).lineLimit(2).padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    intervalClock(state).font(.title2.monospacedDigit()).multilineTextAlignment(.trailing)
                        .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Figures(state: state, labels: context.attributes.labels).padding(.horizontal, 8)
                }
            } compactLeading: {
                Image(systemName: state.pausedAt == nil ? "figure.run" : "pause.fill")
            } compactTrailing: {
                intervalClock(state).monospacedDigit().frame(maxWidth: 56)
            } minimal: {
                Image(systemName: state.pausedAt == nil ? "figure.run" : "pause.fill")
            }
            .widgetURL(context.attributes.link)
        }
    }
}

private struct LockScreen: View {
    let context: ActivityViewContext<LiveSessionAttributes>

    var body: some View {
        if stale {
            Text(context.attributes.labels.stopped).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(context.state.instruction).font(.headline).lineLimit(2)
                    Spacer()
                    if context.state.pausedAt != nil {
                        Text(context.attributes.labels.paused).font(.subheadline.bold()).foregroundStyle(.secondary)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(context.state.intervalEnd == nil ? context.attributes.labels.total
                         : context.attributes.labels.intervalLeft).font(.caption).foregroundStyle(.secondary)
                    intervalClock(context.state).font(.largeTitle.monospacedDigit().bold())
                }
                Figures(state: context.state, labels: context.attributes.labels)
            }
        }
    }

    /// Updates stopped arriving, which is an app that was killed mid-session.
    private var stale: Bool {
        if #available(iOS 16.2, *) { return context.isStale }
        return false
    }
}

/// The session's active time and the pace now, side by side.
///
/// An open interval is the whole session, so its clock is already the active
/// time and is not shown twice.
private struct Figures: View {
    let state: LiveSessionState
    let labels: LiveSessionLabels

    var body: some View {
        HStack {
            if state.intervalEnd != nil {
                figure(labels.total, clock(from: state.sessionStart, to: nil, pausedAt: state.pausedAt))
            }
            Spacer()
            if let pace = state.pace { figure(labels.pace, Text(pace)) }
        }
    }

    private func figure(_ label: String, _ value: Text) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            value.font(.body.monospacedDigit())
        }
    }
}

/// What is left of the interval, or how long an open one has run.
private func intervalClock(_ state: LiveSessionState) -> Text {
    clock(from: state.intervalStart, to: state.intervalEnd, pausedAt: state.pausedAt)
}

/// A clock the system runs on its own, stopped where the recording was held.
private func clock(from start: Date, to end: Date?, pausedAt: Date?) -> Text {
    Text(timerInterval: start...(end ?? .distantFuture), pauseTime: pausedAt, countsDown: end != nil)
}

/// A gym workout on the Lock Screen and in the Dynamic Island: the rest while
/// one runs, and the workout's time otherwise.
struct LiveWorkoutWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LiveWorkoutAttributes.self) { context in
            WorkoutLockScreen(context: context)
                .padding()
                .widgetURL(context.attributes.link)
        } dynamicIsland: { context in
            let state = context.state
            let labels = context.attributes.labels
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(state.exercise).font(.headline).lineLimit(2).padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    workoutClock(state).font(.title2.monospacedDigit()).multilineTextAlignment(.trailing)
                        .padding(.trailing, 8)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.attributes.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        Spacer()
                        Text(state.rest == nil ? labels.elapsed : labels.rest).font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 8)
                }
            } compactLeading: {
                Image(systemName: state.rest == nil ? "dumbbell.fill" : "timer")
            } compactTrailing: {
                workoutClock(state).monospacedDigit().frame(maxWidth: 56)
            } minimal: {
                Image(systemName: state.rest == nil ? "dumbbell.fill" : "timer")
            }
            .widgetURL(context.attributes.link)
        }
    }
}

private struct WorkoutLockScreen: View {
    let context: ActivityViewContext<LiveWorkoutAttributes>

    var body: some View {
        let state = context.state
        let labels = context.attributes.labels
        if stale {
            Text(labels.stopped).font(.headline).frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(context.attributes.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    Text(state.exercise).font(.headline).lineLimit(2)
                }
                HStack(alignment: .lastTextBaseline) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(state.rest == nil ? labels.elapsed : labels.rest).font(.caption)
                            .foregroundStyle(.secondary)
                        workoutClock(state).font(.largeTitle.monospacedDigit().bold())
                    }
                    Spacer()
                    // The workout's time stays in view beside a rest.
                    if state.rest != nil {
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(labels.elapsed).font(.caption).foregroundStyle(.secondary)
                            // A timer takes all the width it is given, so it is set flush right.
                            elapsedClock(state).font(.body.monospacedDigit()).multilineTextAlignment(.trailing)
                        }
                    }
                }
            }
        }
    }

    /// Updates stopped arriving, which is an app that was killed mid-workout.
    private var stale: Bool {
        if #available(iOS 16.2, *) { return context.isStale }
        return false
    }
}

/// The rest left while one runs, else how long the workout has run.
private func workoutClock(_ state: LiveWorkoutState) -> Text {
    guard let rest = state.rest else { return elapsedClock(state) }
    return Text(timerInterval: rest, countsDown: true)
}

private func elapsedClock(_ state: LiveWorkoutState) -> Text {
    Text(timerInterval: state.startedAt...Date.distantFuture, countsDown: false)
}
