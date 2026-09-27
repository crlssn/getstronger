import ActivityKit
import Foundation

/// A recording's Live Activity: raised when it begins, shown as it changes,
/// and ended with it.
///
/// Every failure is silent. An athlete who has turned Live Activities off, or
/// whose phone refuses one, records exactly as though they did not exist.
@available(iOS 16.1, *)
final class LiveSessionActivity {
    private let activity: Activity<LiveSessionAttributes>
    private var shown: LiveSessionState
    private var shownAt = Date()

    init?(labels: LiveSessionLabels, link: URL?, state: LiveSessionState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
        let attributes = LiveSessionAttributes(labels: labels, link: link)
        do {
            if #available(iOS 16.2, *) {
                activity = try Activity.request(attributes: attributes, content: Self.content(state), pushType: nil)
            } else {
                activity = try Activity.request(attributes: attributes, contentState: state, pushType: nil)
            }
        } catch { return nil }
        shown = state
    }

    /// Ends whatever an earlier launch left behind: its recording is over.
    static func endAll() {
        for activity in Activity<LiveSessionAttributes>.activities {
            Task { await activity.end(dismissalPolicy: .immediate) }
        }
    }

    func show(_ state: LiveSessionState) {
        let now = Date()
        guard worthShowing(state, over: shown, secondsSince: now.timeIntervalSince(shownAt)) else { return }
        shown = state
        shownAt = now
        Task { [activity] in
            if #available(iOS 16.2, *) {
                await activity.update(Self.content(state))
            } else {
                await activity.update(using: state)
            }
        }
    }

    func end() {
        Task { [activity] in await activity.end(dismissalPolicy: .immediate) }
    }

    /// A state with the date after which it reads as abandoned, which is how a
    /// force-quit app stops showing a session that is no longer being kept.
    @available(iOS 16.2, *)
    private static func content(_ state: LiveSessionState) -> ActivityContent<LiveSessionState> {
        ActivityContent(state: state, staleDate: Date().addingTimeInterval(liveStaleSeconds))
    }
}
