// swift-tools-version: 5.9
import PackageDescription

// The voice ranking behind the interval announcements, kept out of the app
// target so it can be tested on any machine with a Swift toolchain. The app
// compiles `Sources/AnnouncementVoice` straight into itself rather than
// linking this package: Capacitor owns the project's package references.
let package = Package(
    name: "AnnouncementVoice",
    targets: [
        .target(name: "AnnouncementVoice"),
        .testTarget(name: "AnnouncementVoiceTests", dependencies: ["AnnouncementVoice"])
    ]
)
