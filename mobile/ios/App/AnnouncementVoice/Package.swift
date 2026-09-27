// swift-tools-version: 5.9
import PackageDescription

// What the recorder says, sounds and shows, kept out of the app target so it
// can be tested on any machine with a Swift toolchain: the voice ranking behind
// the interval announcements, the shape of the two pace notes, and what the
// Lock Screen shows of a recording. The app
// compiles each `Sources` folder straight into itself rather than linking
// this package: Capacitor owns the project's package references.
let package = Package(
    name: "AnnouncementVoice",
    targets: [
        .target(name: "AnnouncementVoice"),
        .target(name: "PaceTones"),
        .target(name: "LiveSession"),
        .testTarget(name: "AnnouncementVoiceTests", dependencies: ["AnnouncementVoice"]),
        .testTarget(name: "PaceTonesTests", dependencies: ["PaceTones"]),
        .testTarget(name: "LiveSessionTests", dependencies: ["LiveSession"])
    ]
)
