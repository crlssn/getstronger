import AVFoundation
import Capacitor
import CoreLocation

/// Native ownership keeps the recording independent of the WebView lifecycle.
@objc(TimedCircuitPlugin)
public class TimedCircuitPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "TimedCircuitPlugin"
    public let jsName = "TimedCircuit"
    public let pluginMethods = ["start", "read", "pause", "resume", "finish", "clear", "setVolume"]
        .compactMap { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let location = CLLocationManager()
    private let speech = AVSpeechSynthesizer()
    private var timer: Timer?
    private var recording: [String: Any]?
    private var key = ""
    private var locale = "en"
    private var volume = 1.0
    private var audible = false
    private var spoken = -1
    /// Seconds of warning before an interval ends; 0 sounds nothing.
    private var cueLead = 10.0
    /// The interval already warned about, so the tone sounds once per interval.
    private var cued = -1
    private var permissionCall: CAPPluginCall?
    private var lastCheckpoint = 0.0
    private var now: Double { (Date().timeIntervalSince1970 * 1000).rounded() }
    private var file: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("timed-circuit.json")
    }

    public override func load() {
        DispatchQueue.main.async {
            self.location.delegate = self
            self.location.desiredAccuracy = kCLLocationAccuracyBest
            self.location.distanceFilter = kCLDistanceFilterNone
            self.location.activityType = .fitness
            self.location.pausesLocationUpdatesAutomatically = false
            self.location.allowsBackgroundLocationUpdates = true
            self.location.showsBackgroundLocationIndicator = true
            if let bytes = try? Data(contentsOf: self.file),
               let saved = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
                self.key = saved["key"] as? String ?? ""
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

    /// The tone that warns an interval is about to end.
    ///
    /// Built in memory rather than shipped as an asset: a fifth of a second of
    /// a sine wave is smaller written out than a file would be to add to the
    /// project, and it sounds through the recording's own audio session, which
    /// is what reaches a locked phone.
    private lazy var cue: AVAudioPlayer? = {
        let rate = 44100, seconds = 0.2, frequency = 880.0, peak = 0.7
        let frames = Int(Double(rate) * seconds)
        var samples = Data(capacity: frames * 2)
        for frame in 0..<frames {
            // Fading each end over 10 ms keeps the tone from clicking.
            let fade = min(1, min(Double(frame), Double(frames - frame)) / (Double(rate) * 0.01))
            let value = sin(2 * .pi * frequency * Double(frame) / Double(rate)) * fade * peak
            withUnsafeBytes(of: Int16(value * 32767).littleEndian) { samples.append(contentsOf: $0) }
        }
        func bytes(_ value: Int, _ count: Int) -> Data {
            Data((0..<count).map { UInt8((value >> (8 * $0)) & 0xff) })
        }
        var wav = Data("RIFF".utf8) + bytes(36 + samples.count, 4) + Data("WAVEfmt ".utf8)
        wav += bytes(16, 4) + bytes(1, 2) + bytes(1, 2) + bytes(rate, 4)
        wav += bytes(rate * 2, 4) + bytes(2, 2) + bytes(16, 2)
        wav += Data("data".utf8) + bytes(samples.count, 4) + samples
        guard let player = try? AVAudioPlayer(data: wav) else { return nil }
        player.prepareToPlay()
        return player
    }()

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
        let start = now
        recording = ["version": 1, "startedAt": start, "phases": phases,
                     "pauses": [[String: Any]](), "points": [[String: Any]](), "interrupted": false]
        do {
            if needsAudio { try openAudio() }
            try persist()
        } catch { recording = nil; call.reject("Recording could not start", nil, error); return }
        spoken = -1
        cued = -1
        location.startUpdatingLocation()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        tick()
        call.resolve()
    }

    /// Silence is silent all the way down: an utterance at no volume still holds
    /// the audio session, which ducks whatever the athlete is listening to.
    private func speak(_ instruction: String) {
        guard volume > 0 else { return }
        let utterance = AVSpeechUtterance(string: instruction)
        utterance.voice = AVSpeechSynthesisVoice(language: locale)
        utterance.volume = Float(volume)
        speech.speak(utterance)
    }

    /// Whether anything still wants the audio session.
    ///
    /// The announcements and the cue are two settings, so turning the speech
    /// off is not turning the tone off — and either alone is reason to hold
    /// the session open.
    private var needsAudio: Bool { volume > 0 || cueLead > 0 }

    private func openAudio() throws {
        guard !audible else { return }
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio,
            options: [.duckOthers, .mixWithOthers])
        try AVAudioSession.sharedInstance().setActive(true)
        audible = true
    }

    private func closeAudio() {
        guard audible else { return }
        audible = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func activeMilliseconds(at time: Double) -> Double {
        guard let data = recording else { return 0 }
        let pauses = data["pauses"] as? [[String: Any]] ?? []
        return time - (data["startedAt"] as? Double ?? time) - pauses.reduce(0) {
            $0 + (($1["endedAt"] as? Double ?? time) - ($1["startedAt"] as? Double ?? time))
        }
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
            boundary += openInterval(phase) ? .infinity : (phase["durationSeconds"] as? Double ?? 0) * 1000
            if elapsed < boundary {
                if spoken != index {
                    if spoken >= 0 && index > spoken + 1 { recording?["interrupted"] = true }
                    spoken = index
                    speak(phase["instruction"] as? String ?? "")
                }
                if cued != index, cues(phase), elapsed >= boundary - cueLead * 1000 {
                    cued = index
                    cue?.currentTime = 0
                    cue?.play()
                }
                if time - lastCheckpoint > 1000 { checkpoint() }
                return
            }
        }
        end(at: time - (elapsed - boundary))
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
        let pauses = data["pauses"] as? [[String: Any]] ?? []
        if let last = pauses.last, last["endedAt"] == nil { return }
        var points = data["points"] as? [[String: Any]] ?? []
        for fix in locations {
            let timestamp = (fix.timestamp.timeIntervalSince1970 * 1000).rounded()
            guard timestamp >= (data["startedAt"] as? Double ?? now), timestamp <= now,
                  timestamp > (points.last?["timestamp"] as? Double ?? 0), fix.horizontalAccuracy >= 0 else { continue }
            if points.count >= 90000 { recording?["interrupted"] = true; end(at: now); return }
            points.append(["timestamp": timestamp, "latitude": fix.coordinate.latitude,
                           "longitude": fix.coordinate.longitude, "accuracy": fix.horizontalAccuracy])
        }
        recording?["points"] = points
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
    private func end(at time: Double) {
        guard recording != nil, recording?["endedAt"] == nil else { return }
        recording?["endedAt"] = time
        var pauses = recording?["pauses"] as? [[String: Any]] ?? []
        if !pauses.isEmpty, pauses[pauses.count - 1]["endedAt"] == nil { pauses[pauses.count - 1]["endedAt"] = time }
        recording?["pauses"] = pauses
        location.stopUpdatingLocation()
        timer?.invalidate()
        timer = nil
        speech.stopSpeaking(at: .immediate)
        closeAudio()
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
        let bytes = try JSONSerialization.data(withJSONObject: ["key": key, "recording": recording, "checkpoint": lastCheckpoint])
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var url = file
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try url.setResourceValues(values)
    }
}
