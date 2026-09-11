import AVFoundation
import Capacitor
import CoreLocation

/// One fix as the stationary detector reads it, which is the route's fix plus
/// the speed the receiver measured.
private struct Fix {
    let timestamp: Double
    let latitude: Double
    let longitude: Double
    let accuracy: Double
    let speed: Double?
}

// Auto-pause, mirroring `web/src/utils/movement.ts`: under half a slow walk
// for the dwell holds the recording, and over that again lets it go. The gap
// between the two keeps a pace either side of one line from fluttering it,
// and the dwell is short because the hold is backdated to where the athlete
// stopped: it costs nothing but the seconds before the recording notices.
private let pauseSpeed = 2000.0 / 3600
private let resumeSpeed = 3000.0 / 3600
private let dwellMs = 2000.0
private let continuousMs = 3000.0
private let maxFixes = 60
private let maxAccuracy = 30.0
// Under this a measured speed is a phone standing and its fixes wandering,
// mirroring `standingSpeed` in `web/src/utils/timedCircuit.ts`.
private let standingSpeed = 0.3
// How fast the position filter lets the athlete have moved since the last
// fix, mirroring `wanderSpeed` in `web/src/utils/timedCircuit.ts`.
private let wanderSpeed = 3.0

/// Native ownership keeps the recording independent of the WebView lifecycle.
@objc(TimedCircuitPlugin)
public class TimedCircuitPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "TimedCircuitPlugin"
    public let jsName = "TimedCircuit"
    public let pluginMethods = ["start", "read", "pause", "resume", "finish", "clear", "setVolume"]
        .compactMap { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let location = CLLocationManager()
    private let speech = AVSpeechSynthesizer()
    private let engine = AVAudioEngine()
    private let tonePlayer = AVAudioPlayerNode()
    private var tones: [String: AVAudioPCMBuffer] = [:]
    private var timer: Timer?
    private var recording: [String: Any]?
    private var key = ""
    private var locale = "en"
    private var volume = 1.0
    private var audible = false
    /// Whether whatever else is playing is currently held down for a word.
    private var ducking = false
    private var autoPauses = false
    private var fixes: [Fix] = []
    /// The route as `smoothedPoints` has read it so far, and the filter's state.
    private var smoothed: [[String: Any]] = []
    private var filtered = 0
    private var filterLatitude = 0.0
    private var filterLongitude = 0.0
    private var filterVariance = 0.0
    private var filterAt = 0.0
    private var spoken = -1
    /// Seconds of warning before an interval ends; 0 says nothing.
    private var cueLead = 10.0
    /// The warning, spoken: the seconds left, already in the athlete's language.
    private var cuePhrase = ""
    /// Said once the last interval runs out; a session ended by hand says nothing.
    private var completedPhrase = ""
    /// The interval already warned about, so the cue is said once per interval.
    private var cued = -1
    // The session this one is paced against, as the web app settled it: a
    // target for each interval, and the three numbers that say when a
    // difference is worth hearing. Empty targets are a recording with nothing
    // to compare against, which is every first recording of a routine.
    private var paceTargets: [Double] = []
    private var paceTolerance = 0.0
    private var paceGap = 0.0
    private var paceWindow = 0.0
    private var paceZone = ""
    private var paceZonePhase = -1
    private var paceTonedAt = 0.0
    /// How loud a note is against a full-volume announcement: a fifth was
    /// lost under a footfall on a busy road.
    private let toneVolume = 0.6
    /// A shade under the synthesiser's own pace, which reads a short cue as
    /// though it were a sentence rather than a label.
    private let announcementRate = AVSpeechUtteranceDefaultSpeechRate * 0.95
    private var permissionCall: CAPPluginCall?
    private var lastCheckpoint = 0.0
    private var now: Double { (Date().timeIntervalSince1970 * 1000).rounded() }
    private var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("timed-circuit.json")
    }

    public override func load() {
        DispatchQueue.main.async {
            self.speech.delegate = self
            self.location.delegate = self
            self.location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
            self.location.distanceFilter = kCLDistanceFilterNone
            self.location.activityType = .fitness
            self.location.pausesLocationUpdatesAutomatically = false
            self.location.allowsBackgroundLocationUpdates = true
            self.location.showsBackgroundLocationIndicator = true
            if let bytes = try? Data(contentsOf: self.file),
               let saved = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
                self.key = saved["key"] as? String ?? ""
                self.autoPauses = saved["autoPause"] as? Bool ?? false
                self.recording = saved["recording"] as? [String: Any]
                if self.recording?["endedAt"] == nil {
                    self.recording?["interrupted"] = true
                    self.end(at: saved["checkpoint"] as? Double ?? self.now)
                }
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.recording == nil, self.permissionCall == nil else {
                call.reject("A recording is already saved or active"); return
            }
            switch self.location.authorizationStatus {
            case .notDetermined:
                self.permissionCall = call
                self.location.requestWhenInUseAuthorization()
            case .authorizedAlways, .authorizedWhenInUse: self.begin(call)
            default: call.reject("Location permission is required for guided recording", "LOCATION_DENIED")
            }
        }
    }

    /// A phase naming no duration is the one open interval of a session with no
    /// set length; it runs until the athlete ends it.
    private func openInterval(_ phase: [String: Any]) -> Bool {
        phase["durationSeconds"] == nil || phase["durationSeconds"] is NSNull
    }

    /// Whether an interval is long enough to be worth warning about.
    ///
    /// A cue at or before the midpoint is a second instruction rather than a
    /// warning, so anything shorter than twice the lead runs out unannounced.
    private func cues(_ phase: [String: Any]) -> Bool {
        guard cueLead > 0, !openInterval(phase) else { return false }
        return (phase["durationSeconds"] as? Double ?? 0) >= cueLead * 2
    }

    private func begin(_ call: CAPPluginCall) {
        guard let phases = call.getArray("phases", [String: Any].self), !phases.isEmpty,
              phases.count <= 10000,
              (phases.count == 1 && openInterval(phases[0]))
                || phases.allSatisfy({ ($0["durationSeconds"] as? Int ?? 0) > 0 }),
              let requestedKey = call.getString("key") else { call.reject("Invalid prescription"); return }
        key = requestedKey
        locale = call.getString("locale") ?? "en"
        volume = min(max(call.getDouble("volume") ?? 1, 0), 1)
        cueLead = Double(call.getInt("cueLeadSeconds") ?? 10)
        cuePhrase = call.getString("cuePhrase") ?? ""
        completedPhrase = call.getString("completedPhrase") ?? ""
        readPacing(call.getObject("pacing"))
        autoPauses = call.getBool("autoPause") ?? false
        fixes = []
        resetFilter()
        let start = now
        recording = ["version": 1, "startedAt": start, "phases": phases,
                     "pauses": [[String: Any]](), "points": [[String: Any]](), "interrupted": false]
        do {
            if needsAudio { try openAudio() }
            try persist()
        } catch { recording = nil; call.reject("Recording could not start", nil, error); return }
        spoken = -1
        cued = -1
        // After the session is active: an engine started before it has nothing
        // to play into.
        prepareTones()
        location.startUpdatingLocation()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        tick()
        call.resolve()
    }

    /// Silence is silent all the way down: an utterance at no volume still holds
    /// the audio session for nothing. The level defaults to the announcements'.
    private func speak(_ instruction: String, at level: Double? = nil) {
        let level = level ?? volume
        guard level > 0 else { return }
        let utterance = AVSpeechUtterance(string: announcementPhrase(instruction))
        utterance.voice = announcementVoice()
        utterance.volume = Float(level)
        utterance.rate = announcementRate
        duck(true)
        speech.speak(utterance)
    }

    /// The cue is its own setting, so the announcements being off does not
    /// silence it: it is said at full volume instead.
    private var cueVolume: Double { volume > 0 ? volume : 1 }

    /// The ending is the last thing said, and the audio session waits for it:
    /// closed under an utterance, the session cuts the word off.
    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        releaseAudioIfDone()
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        releaseAudioIfDone()
    }

    private func releaseAudioIfDone() {
        guard !speech.isSpeaking else { return }
        duck(false)
        guard recording == nil || recording?["endedAt"] != nil else { return }
        closeAudio()
    }

    /// The best-sounding voice installed for the announcement locale, falling
    /// back to the one the synthesiser would have picked. Every candidate is
    /// already on the phone, so the choice costs no network.
    private func announcementVoice() -> AVSpeechSynthesisVoice? {
        let installed = AVSpeechSynthesisVoice.speechVoices().map {
            SpokenVoice(identifier: $0.identifier, language: $0.language, quality: quality(of: $0))
        }
        if let best = bestVoice(for: locale, among: installed),
           let voice = AVSpeechSynthesisVoice(identifier: best.identifier) {
            return voice
        }
        return AVSpeechSynthesisVoice(language: announcementLocale(locale))
    }

    private func quality(of voice: AVSpeechSynthesisVoice) -> VoiceQuality {
        switch voice.quality {
        case .premium: return .premium
        case .enhanced: return .enhanced
        default: return .standard
        }
    }

    /// Whether anything still wants the audio session.
    ///
    /// The announcements and the cue are two settings, so turning the speech
    /// off is not turning the tone off — and either alone is reason to hold
    /// the session open.
    private var needsAudio: Bool { volume > 0 || cueLead > 0 }

    /// Mixed over whatever is playing: a runner's music is theirs, and the
    /// notes are short enough to be heard over it.
    private func openAudio() throws {
        guard !audible else { return }
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try AVAudioSession.sharedInstance().setActive(true)
        audible = true
    }

    /// Holds whatever else is playing down while a word is said, and lets it
    /// back up after it.
    ///
    /// Mixing alone lost a cue under a chorus. How far the other audio drops
    /// is the system's to decide — roughly a fifth of where it was — because
    /// `duckOthers` is the whole of the API: there is no level to ask for.
    private func duck(_ ducked: Bool) {
        guard audible, ducked != ducking else { return }
        let options: AVAudioSession.CategoryOptions =
            ducked ? [.mixWithOthers, .duckOthers] : [.mixWithOthers]
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: options)
            // Re-activated so the option is applied to a session that is
            // already running rather than to the next one.
            try AVAudioSession.sharedInstance().setActive(true)
            ducking = ducked
        } catch {
            // Whatever is playing carries on at its own volume, and the
            // announcement is still said over it.
        }
    }

    private func closeAudio() {
        guard audible else { return }
        audible = false
        ducking = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func activeMilliseconds(at time: Double) -> Double {
        guard let data = recording else { return 0 }
        let pauses = data["pauses"] as? [[String: Any]] ?? []
        return time - (data["startedAt"] as? Double ?? time) - pauses.reduce(0) {
            $0 + (($1["endedAt"] as? Double ?? time) - ($1["startedAt"] as? Double ?? time))
        }
    }

    /// The comparison the recorder holds each interval to, or none at all.
    private func readPacing(_ pacing: [String: Any]?) {
        paceZone = ""
        paceZonePhase = -1
        paceTonedAt = 0
        paceTargets = ((pacing?["targets"] as? [Any]) ?? []).map { ($0 as? NSNumber)?.doubleValue ?? 0 }
        paceTolerance = (pacing?["toleranceSeconds"] as? NSNumber)?.doubleValue ?? 0
        paceGap = (pacing?["minimumGapSeconds"] as? NSNumber)?.doubleValue ?? 0
        paceWindow = (pacing?["windowSeconds"] as? NSNumber)?.doubleValue ?? 0
    }

    /// Two short notes, higher for ahead and lower for behind, generated
    /// rather than shipped: the same two the browser recorder sounds. The cue
    /// is spoken, so a note is never mistaken for it.
    ///
    /// They follow the announcement volume: turned off, the recorder holds no
    /// audio session at all, and a session that says nothing must not beep.
    private func prepareTones() {
        guard volume > 0, !paceTargets.isEmpty else { return }
        try? openAudio()
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1) else { return }
        if tones.isEmpty {
            guard let ahead = note(hertz: 1320, format: format),
                  let behind = note(hertz: 440, format: format) else { return }
            engine.attach(tonePlayer)
            engine.connect(tonePlayer, to: engine.mainMixerNode, format: format)
            tones = ["ahead": ahead, "behind": behind]
        }
        tonePlayer.volume = Float(toneVolume * volume)
        if !engine.isRunning { try? engine.start() }
        if !tonePlayer.isPlaying { tonePlayer.play() }
    }

    private func note(hertz: Double, format: AVAudioFormat) -> AVAudioPCMBuffer? {
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(format.sampleRate * 0.3)),
              let samples = buffer.floatChannelData?[0] else { return nil }
        let frames = buffer.frameCapacity
        buffer.frameLength = frames
        let fadeFrames = format.sampleRate * 0.02
        for frame in 0..<Int(frames) {
            // Faded at both ends: a square edge on a sine is heard as a click.
            let fade = min(1.0, min(Double(frame), Double(Int(frames) - frame)) / fadeFrames)
            samples[frame] = Float(sin(2 * .pi * hertz * Double(frame) / format.sampleRate) * fade)
        }
        return buffer
    }

    private func play(tone: String) {
        // Prepared again on every note: the athlete can turn the announcements
        // up mid-run, and the session they were off for was never opened.
        prepareTones()
        guard let buffer = tones[tone], volume > 0 else { return }
        tonePlayer.scheduleBuffer(buffer, at: nil, options: [])
    }

    private func resetFilter() {
        smoothed = []
        filtered = 0
        filterAt = 0
    }

    /// The route as the athlete most likely ran it, mirroring `smoothRoute` in
    /// `web/src/utils/timedCircuit.ts`: a Kalman filter on each axis, weighing
    /// every usable fix by its accuracy against how far the athlete could have
    /// moved since the last. Kept up with the recording rather than re-read
    /// from the start on every tick.
    private func smoothedPoints() -> [[String: Any]] {
        let points = recording?["points"] as? [[String: Any]] ?? []
        if points.count < filtered { resetFilter() }
        for point in points[filtered...] {
            filtered += 1
            let accuracy = point["accuracy"] as? Double ?? -1
            let timestamp = point["timestamp"] as? Double ?? 0
            guard accuracy >= 0, accuracy <= maxAccuracy, smoothed.isEmpty || timestamp > filterAt else { continue }
            let latitude = point["latitude"] as? Double ?? 0
            let longitude = point["longitude"] as? Double ?? 0
            let noise = accuracy * accuracy
            if smoothed.isEmpty {
                filterLatitude = latitude
                filterLongitude = longitude
                filterVariance = noise
            } else {
                filterVariance += wanderSpeed * wanderSpeed * (timestamp - filterAt) / 1000
                let gain = filterVariance + noise > 0 ? filterVariance / (filterVariance + noise) : 1
                filterLatitude += gain * (latitude - filterLatitude)
                let eastward = (longitude - filterLongitude + 540).truncatingRemainder(dividingBy: 360) - 180
                filterLongitude = (filterLongitude + gain * eastward + 540).truncatingRemainder(dividingBy: 360) - 180
                filterVariance *= 1 - gain
            }
            filterAt = timestamp
            var copy = point
            copy["latitude"] = filterLatitude
            copy["longitude"] = filterLongitude
            smoothed.append(copy)
        }
        return smoothed
    }

    /// Whether the movement between two smoothed fixes is worth measuring, on
    /// the same terms the app measures a saved route on: in order, and slow
    /// enough to be a person on foot.
    private func accepted(_ a: [String: Any], _ b: [String: Any]) -> Bool {
        let seconds = ((b["timestamp"] as? Double ?? 0) - (a["timestamp"] as? Double ?? 0)) / 1000
        return seconds > 0 && metres(a, b) / seconds <= 15
    }

    /// Whether the recording was held for any of the time between two fixes.
    private func spansPause(_ a: [String: Any], _ b: [String: Any]) -> Bool {
        let from = a["timestamp"] as? Double ?? 0
        let to = b["timestamp"] as? Double ?? 0
        let pauses = recording?["pauses"] as? [[String: Any]] ?? []
        return pauses.contains { pause in
            from < (pause["endedAt"] as? Double ?? .infinity) && to > (pause["startedAt"] as? Double ?? 0)
        }
    }

    /// How far the athlete went between two smoothed fixes, as the app
    /// measures it: the chord, unless the receiver read the phone as standing
    /// at both ends, which is a phone at a crossing and its fixes wandering.
    private func edgeMetres(_ a: [String: Any], _ b: [String: Any]) -> Double {
        if let from = a["speed"] as? Double, let to = b["speed"] as? Double, from >= 0, to >= 0,
           (from + to) / 2 < standingSpeed { return 0 }
        return metres(a, b)
    }

    private func metres(_ a: [String: Any], _ b: [String: Any]) -> Double {
        let fromLatitude = (a["latitude"] as? Double ?? 0) * .pi / 180
        let toLatitude = (b["latitude"] as? Double ?? 0) * .pi / 180
        let latitude = toLatitude - fromLatitude
        let longitude = ((b["longitude"] as? Double ?? 0) - (a["longitude"] as? Double ?? 0)) * .pi / 180
        let h = pow(sin(latitude / 2), 2) + cos(fromLatitude) * cos(toLatitude) * pow(sin(longitude / 2), 2)
        return 6371000 * 2 * asin(min(1, sqrt(h)))
    }

    /// Pace over the trailing window in seconds per kilometre, or nothing:
    /// one fix is a position rather than a speed.
    private func currentPace(at time: Double) -> Double? {
        let points = smoothedPoints()
        let since = time - paceWindow * 1000
        var metresRun = 0.0
        var seconds = 0.0
        for index in 1..<max(points.count, 1) {
            let a = points[index - 1], b = points[index]
            let closed = b["timestamp"] as? Double ?? 0
            // Whole edges, by the fix that closed them, as the app measures.
            // An edge across a pause is mostly standing, which is not a pace.
            guard closed > since, closed <= time, accepted(a, b), !spansPause(a, b) else { continue }
            metresRun += edgeMetres(a, b)
            seconds += (closed - (a["timestamp"] as? Double ?? closed)) / 1000
        }
        return metresRun > 0 ? (seconds / metresRun) * 1000 : nil
    }

    /// Sounds the crossing where this interval leaves the band the reference
    /// session set for it, at most once every gap.
    private func judge(interval index: Int, seconds: Double, at time: Double) {
        // Turned off, nothing is judged rather than judged and swallowed:
        // turning the sound back on hears the next crossing rather than
        // missing it.
        guard volume > 0 else { return }
        if paceZonePhase != index {
            paceZonePhase = index
            paceZone = ""
        }
        guard index < paceTargets.count else { return }
        let target = paceTargets[index]
        guard target > 0, seconds >= paceWindow, let pace = currentPace(at: time) else { return }

        let zone = pace < target - paceTolerance ? "ahead" : pace > target + paceTolerance ? "behind" : "holding"
        if zone == "holding" {
            paceZone = zone
            return
        }
        // A crossing the gap swallowed stays pending, so it is heard late
        // rather than not at all.
        guard zone != paceZone, paceTonedAt == 0 || time - paceTonedAt >= paceGap * 1000 else { return }
        paceZone = zone
        paceTonedAt = time
        play(tone: zone)
    }

    private func tick() {
        guard let data = recording, data["endedAt"] == nil else { return }
        let time = now
        if time - (data["startedAt"] as? Double ?? time) >= 86400000 {
            recording?["interrupted"] = true; end(at: time); return
        }
        let pauses = data["pauses"] as? [[String: Any]] ?? []
        if let last = pauses.last, last["endedAt"] == nil { return }
        let phases = data["phases"] as? [[String: Any]] ?? []
        let elapsed = activeMilliseconds(at: time)
        var boundary = 0.0
        for (index, phase) in phases.enumerated() {
            let opened = boundary
            boundary += openInterval(phase) ? .infinity : (phase["durationSeconds"] as? Double ?? 0) * 1000
            if elapsed < boundary {
                if spoken != index {
                    if spoken >= 0 && index > spoken + 1 { recording?["interrupted"] = true }
                    spoken = index
                    speak(phase["instruction"] as? String ?? "")
                }
                if cued != index, cues(phase), elapsed >= boundary - cueLead * 1000 {
                    cued = index
                    speak(cuePhrase, at: cueVolume)
                }
                judge(interval: index, seconds: (elapsed - opened) / 1000, at: time)
                if time - lastCheckpoint > 1000 { checkpoint() }
                return
            }
        }
        end(at: time - (elapsed - boundary), saying: completedPhrase)
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if let call = permissionCall {
            if manager.authorizationStatus == .notDetermined { return }
            permissionCall = nil
            if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways {
                begin(call)
            } else { call.reject("Location permission denied", "LOCATION_DENIED") }
        } else if recording != nil && recording?["endedAt"] == nil &&
                    (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted) {
            recording?["interrupted"] = true
            end(at: now)
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        tick()
        guard let data = recording, data["endedAt"] == nil else { return }
        var points = data["points"] as? [[String: Any]] ?? []
        for fix in locations {
            let timestamp = (fix.timestamp.timeIntervalSince1970 * 1000).rounded()
            let seen = max(points.last?["timestamp"] as? Double ?? 0, self.fixes.last?.timestamp ?? 0)
            guard timestamp >= (data["startedAt"] as? Double ?? now), timestamp <= now,
                  timestamp > seen, fix.horizontalAccuracy >= 0 else { continue }
            // A receiver that could not measure a speed reports a negative one.
            let speed = fix.speed >= 0 ? fix.speed : nil
            self.fixes.append(Fix(timestamp: timestamp, latitude: fix.coordinate.latitude,
                                  longitude: fix.coordinate.longitude,
                                  accuracy: fix.horizontalAccuracy, speed: speed))
            self.fixes = Array(self.fixes.suffix(maxFixes))
            autoPause(at: timestamp)
            let pauses = recording?["pauses"] as? [[String: Any]] ?? []
            // A hold the detector opened stops the clock, not the route: it may
            // have read a creep as a standstill. A hold the athlete opened drops
            // its fixes, because they may have gone home with it still open.
            if let last = pauses.last, last["endedAt"] == nil, last["auto"] == nil { continue }
            if points.count >= 90000 { recording?["interrupted"] = true; end(at: now); return }
            var point: [String: Any] = ["timestamp": timestamp, "latitude": fix.coordinate.latitude,
                                        "longitude": fix.coordinate.longitude, "accuracy": fix.horizontalAccuracy]
            if let speed { point["speed"] = speed }
            points.append(point)
        }
        recording?["points"] = points
        checkpoint()
    }

    /// The fixes from the last one at or before `since` up to `at`, or nothing
    /// when a hole interrupts them: it hides whatever happened during it.
    private func unbroken(_ seen: [Fix], since: Double, at: Double) -> [Fix]? {
        guard let anchor = seen.last(where: { $0.timestamp <= since }) else { return nil }
        let window = seen.filter { $0.timestamp >= anchor.timestamp }
        var previous = anchor.timestamp
        for fix in window.dropFirst() {
            if fix.timestamp - previous > continuousMs { return nil }
            previous = fix.timestamp
        }
        if at - previous > continuousMs { return nil }
        return window
    }

    /// What the recent fixes say the athlete is doing, or nothing when they say
    /// neither, mirroring `readMovement` in `web/src/utils/movement.ts`. A
    /// receiver that measures speed is believed over the dwell. One that does
    /// not leaves only where its fixes landed, whose error circles bound the
    /// movement either way, so the window grows until a standing athlete's
    /// bound falls under the pause speed and says nothing before that.
    private func readMovement(at: Double) -> String? {
        let seen = fixes.filter { $0.accuracy >= 0 && $0.accuracy <= maxAccuracy && $0.timestamp <= at }
        // The window reaches back to where the athlete was when the dwell
        // began, so it needs a fix from before that.
        guard let dwell = unbroken(seen, since: at - dwellMs, at: at) else { return nil }
        if let speed = dwell.compactMap({ $0.speed }).max() {
            if speed < pauseSpeed { return "still" }
            return speed > resumeSpeed ? "moving" : nil
        }
        let radius = dwell.map { $0.accuracy }.max() ?? 0
        guard let window = unbroken(seen, since: at - max(dwellMs, 2 * radius * 1000 / pauseSpeed), at: at),
              let first = window.first, let last = window.last else { return nil }
        let seconds = (last.timestamp - first.timestamp) / 1000
        guard seconds > 0 else { return nil }
        let chord = CLLocation(latitude: first.latitude, longitude: first.longitude)
            .distance(from: CLLocation(latitude: last.latitude, longitude: last.longitude))
        let circle = max(first.accuracy, last.accuracy)
        if (chord + circle) / seconds < pauseSpeed { return "still" }
        return max(0, chord - circle) / seconds > resumeSpeed ? "moving" : nil
    }

    /// Hold or release the recording on what the fixes say, when it was asked
    /// to. Only a pause it opened itself is released: an athlete who paused by
    /// hand meant it.
    private func autoPause(at: Double) {
        guard autoPauses, let data = recording, data["endedAt"] == nil else { return }
        var pauses = data["pauses"] as? [[String: Any]] ?? []
        let open = pauses.last.map { $0["endedAt"] == nil } ?? false
        if open, pauses[pauses.count - 1]["auto"] == nil { return }
        guard let movement = readMovement(at: at) else { return }
        if open {
            guard movement == "moving" else { return }
            pauses[pauses.count - 1]["endedAt"] = at
        } else {
            guard movement == "still" else { return }
            // Held from where the athlete stopped rather than from where the
            // dwell noticed, and never back past the last thing that happened.
            let after = pauses.last?["endedAt"] as? Double ?? data["startedAt"] as? Double ?? at
            pauses.append(["startedAt": max(at - dwellMs, after), "auto": true])
            speech.stopSpeaking(at: .immediate)
        }
        recording?["pauses"] = pauses
        checkpoint()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        recording?["interrupted"] = true
        checkpoint()
    }

    @objc func read(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.tick()
            call.resolve(call.getString("key") == self.key ? ["recording": self.recording as Any] : [:])
        }
    }
    @objc func pause(_ call: CAPPluginCall) {
        mutate(call) {
            self.tick()
            guard self.recording?["endedAt"] == nil else { return }
            var pauses = self.recording?["pauses"] as? [[String: Any]] ?? []
            guard pauses.last == nil || pauses.last?["endedAt"] != nil else { return }
            pauses.append(["startedAt": self.now])
            self.recording?["pauses"] = pauses
            self.speech.stopSpeaking(at: .immediate)
        }
    }
    @objc func resume(_ call: CAPPluginCall) {
        mutate(call) {
            var pauses = self.recording?["pauses"] as? [[String: Any]] ?? []
            guard !pauses.isEmpty, pauses[pauses.count - 1]["endedAt"] == nil else { return }
            pauses[pauses.count - 1]["endedAt"] = self.now
            self.recording?["pauses"] = pauses
        }
    }
    @objc func finish(_ call: CAPPluginCall) { mutate(call) { self.end(at: self.now) } }
    /// Turned down mid-session, so the level is taken without touching the clock.
    @objc func setVolume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard call.getString("key") == self.key else { call.reject("Recording not found"); return }
            self.volume = min(max(call.getDouble("volume") ?? 1, 0), 1)
            if self.volume == 0 { self.speech.stopSpeaking(at: .immediate) }
            // A session that started silent has no audio session yet, and
            // failing to open one is a quiet run rather than a lost one. The
            // cue holds it open on its own once the announcements are off.
            if self.needsAudio { try? self.openAudio() } else { self.closeAudio() }
            call.resolve()
        }
    }
    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard call.getString("key") == self.key else { call.resolve(); return }
            self.end(at: self.now)
            do { if FileManager.default.fileExists(atPath: self.file.path) { try FileManager.default.removeItem(at: self.file) } }
            catch { call.reject("Recording could not be removed", nil, error); return }
            self.recording = nil
            self.fixes = []
            self.resetFilter()
            self.key = ""
            call.resolve()
        }
    }
    private func mutate(_ call: CAPPluginCall, action: @escaping () -> Void) {
        DispatchQueue.main.async {
            guard call.getString("key") == self.key, self.recording != nil else { call.reject("Recording not found"); return }
            action()
            do { try self.persist(); call.resolve() }
            catch { self.recording?["interrupted"] = true; self.end(at: self.now); call.reject("Recording could not be saved", nil, error) }
        }
    }
    /// Ends the recording, saying `phrase` first where the prescription ran
    /// out on its own; a session ended by hand is cut off mid-word instead.
    private func end(at time: Double, saying phrase: String = "") {
        guard recording != nil, recording?["endedAt"] == nil else { return }
        recording?["endedAt"] = time
        var pauses = recording?["pauses"] as? [[String: Any]] ?? []
        if !pauses.isEmpty, pauses[pauses.count - 1]["endedAt"] == nil { pauses[pauses.count - 1]["endedAt"] = time }
        recording?["pauses"] = pauses
        location.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        if engine.isRunning { engine.stop() }
        // Said, the phrase holds the session until the synthesiser reports it
        // finished; cut off, the session goes now.
        if phrase.isEmpty || volume <= 0 {
            speech.stopSpeaking(at: .immediate)
            closeAudio()
        } else {
            speak(phrase)
        }
        checkpoint()
    }
    private func checkpoint() {
        do { try persist() }
        catch {
            recording?["interrupted"] = true
            location.stopUpdatingLocation()
            timer?.invalidate()
            recording?["endedAt"] = now
        }
    }
    private func persist() throws {
        guard let recording else { return }
        lastCheckpoint = now
        let bytes = try JSONSerialization.data(withJSONObject: [
            "key": key, "recording": recording, "checkpoint": lastCheckpoint, "autoPause": autoPauses,
        ])
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var url = file
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
}
