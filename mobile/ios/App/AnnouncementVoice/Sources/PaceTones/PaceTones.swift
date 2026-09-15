import Foundation

/// The shape of one of the two pace notes, mirroring `paceTones` in
/// `web/src/native/cueTone.ts`.
///
/// Pitch alone is a poor signal on a road: a fifth is hard to place under
/// music and behind a footfall. Rhythm carries where pitch does not, so ahead
/// is two quick taps and behind is one long note — told apart by counting,
/// which needs no ear at all.
struct ToneShape {
    let hertz: Double
    /// How long one beep lasts, in seconds.
    let seconds: Double
    /// How many beeps the note is made of.
    let beeps: Int
    /// The silence between them, in seconds.
    let gapSeconds: Double
    /// How loud, as a fraction of the level the note is played at.
    let level: Double
}

let toneShapes: [String: ToneShape] = [
    "ahead": ToneShape(hertz: 1320, seconds: 0.07, beeps: 2, gapSeconds: 0.06, level: 0.6),
    "behind": ToneShape(hertz: 440, seconds: 0.6, beeps: 1, gapSeconds: 0, level: 1),
]

// Ramped rather than switched at both ends: a square edge on a sine is heard
// as a click.
private let toneFadeSeconds = 0.01

/// One note as silence with the shape's beeps written into it.
///
/// The shape's own level is baked into the samples rather than set on the
/// player, which carries one volume for both notes.
func toneSamples(_ shape: ToneShape, sampleRate: Double) -> [Float] {
    let beepFrames = Int(sampleRate * shape.seconds)
    let gapFrames = Int(sampleRate * shape.gapSeconds)
    let frames = beepFrames * shape.beeps + gapFrames * (shape.beeps - 1)
    guard beepFrames > 0, frames > 0 else { return [] }
    var samples = [Float](repeating: 0, count: frames)
    let fadeFrames = sampleRate * toneFadeSeconds
    for beep in 0..<shape.beeps {
        let start = beep * (beepFrames + gapFrames)
        for frame in 0..<beepFrames {
            let fade = min(1.0, min(Double(frame), Double(beepFrames - frame)) / fadeFrames)
            let wave = sin(2 * .pi * shape.hertz * Double(frame) / sampleRate)
            samples[start + frame] = Float(wave * fade * shape.level)
        }
    }
    return samples
}
