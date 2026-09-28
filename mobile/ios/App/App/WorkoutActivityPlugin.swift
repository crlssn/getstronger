import ActivityKit
import Capacitor

/// A gym workout on the Lock Screen, kept by the web app: its clock lives in
/// the WebView, so each change to it crosses the bridge as a whole state.
///
/// Every failure is silent, as for a recording's activity.
@objc(WorkoutActivityPlugin)
public class WorkoutActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutActivityPlugin"
    public let jsName = "WorkoutActivity"
    public let pluginMethods = ["show", "end"]
        .compactMap { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    /// Updates run one after another, so a late one never overwrites a newer state.
    private var queue: Task<Void, Never>?

    public override func load() {
        // A new process knows nothing of the workout an old one showed; the
        // workout screen raises it again when it opens.
        guard #available(iOS 16.1, *) else { return }
        run { for activity in Activity<LiveWorkoutAttributes>.activities { await activity.end(dismissalPolicy: .immediate) } }
    }

    @objc func show(_ call: CAPPluginCall) {
        call.resolve()
        guard #available(iOS 16.1, *), let key = call.getString("key"), let labels = call.getObject("labels"),
              let startedAt = call.getDouble("startedAt") else { return }
        let attributes = LiveWorkoutAttributes(
            key: key, name: call.getString("name") ?? "",
            labels: LiveWorkoutLabels(elapsed: labels["elapsed"] as? String ?? "", rest: labels["rest"] as? String ?? "",
                                      stopped: labels["stopped"] as? String ?? ""),
            link: call.getString("path").flatMap { URL(string: "getstronger:/" + $0) })
        let state = liveWorkoutState(exercise: call.getString("exercise") ?? "", startedAt: startedAt,
                                     restEndsAt: call.getDouble("restEndsAt"), restSeconds: call.getDouble("restSeconds"),
                                     at: Date().timeIntervalSince1970 * 1000)
        run {
            // A recording owns the Lock Screen while it runs.
            let recording = Activity<LiveSessionAttributes>.activities.contains { $0.activityState == .active }
            var shown = false
            for activity in Activity<LiveWorkoutAttributes>.activities {
                if !recording && !shown && activity.attributes == attributes {
                    shown = true
                    await Self.update(activity, state)
                } else {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
            guard !recording, !shown, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            if #available(iOS 16.2, *) {
                _ = try? Activity.request(attributes: attributes, content: Self.content(state), pushType: nil)
            } else {
                _ = try? Activity.request(attributes: attributes, contentState: state, pushType: nil)
            }
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        call.resolve()
        guard #available(iOS 16.1, *), let key = call.getString("key") else { return }
        run {
            for activity in Activity<LiveWorkoutAttributes>.activities where activity.attributes.key == key {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }

    /// Ends the workout on show, for a recording that is taking the Lock Screen.
    static func endAll() {
        guard #available(iOS 16.1, *) else { return }
        for activity in Activity<LiveWorkoutAttributes>.activities {
            Task { await activity.end(dismissalPolicy: .immediate) }
        }
    }

    private func run(_ step: @escaping () async -> Void) {
        DispatchQueue.main.async {
            let previous = self.queue
            self.queue = Task {
                await previous?.value
                await step()
            }
        }
    }

    @available(iOS 16.1, *)
    private static func update(_ activity: Activity<LiveWorkoutAttributes>, _ state: LiveWorkoutState) async {
        if #available(iOS 16.2, *) {
            await activity.update(content(state))
        } else {
            await activity.update(using: state)
        }
    }

    /// A state with the date after which it reads as abandoned.
    @available(iOS 16.2, *)
    private static func content(_ state: LiveWorkoutState) -> ActivityContent<LiveWorkoutState> {
        ActivityContent(state: state, staleDate: Date().addingTimeInterval(liveWorkoutStaleSeconds))
    }
}
