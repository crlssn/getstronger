import XCTest

@testable import PaceTones

/// Where the fade has run its course and the sample is the wave alone.
private let sampleRate = 44100.0

final class ToneSamplesTests: XCTestCase {
    // Two taps of 70ms with 60ms of silence between them, as the browser
    // recorder sounds them.
    func testWritesEachBeepAndTheSilenceBetweenThem() throws {
        let shape = try XCTUnwrap(toneShapes["ahead"])
        let samples = toneSamples(shape, sampleRate: sampleRate)

        let beep = Int(sampleRate * 0.07)
        let gap = Int(sampleRate * 0.06)
        XCTAssertEqual(samples.count, beep * 2 + gap)
        // The gap is silence, and the second tap starts after it.
        XCTAssertEqual(samples[(beep + gap / 2)], 0)
        XCTAssertTrue(samples[(beep + gap)..<(beep + gap + beep)].contains { $0 != 0 })
    }

    // The shape's own level is baked into the samples rather than set on the
    // player, which carries one volume for both notes.
    func testBakesTheShapesOwnLevelIntoTheWave() throws {
        let ahead = try XCTUnwrap(toneShapes["ahead"])
        let behind = try XCTUnwrap(toneShapes["behind"])

        XCTAssertEqual(toneSamples(ahead, sampleRate: sampleRate).map(abs).max() ?? 0, 0.6, accuracy: 0.01)
        XCTAssertEqual(toneSamples(behind, sampleRate: sampleRate).map(abs).max() ?? 0, 1, accuracy: 0.01)
    }

    // A square edge on a sine is heard as a click, so both ends ramp.
    func testRampsBothEndsOfEveryBeep() throws {
        let shape = try XCTUnwrap(toneShapes["behind"])
        let samples = toneSamples(shape, sampleRate: sampleRate)

        XCTAssertEqual(samples.first, 0)
        XCTAssertEqual(samples.last ?? 1, 0, accuracy: 0.001)
        // Ten milliseconds in, the ramp is done and the note is at full height.
        let fade = Int(sampleRate * 0.01)
        XCTAssertLessThan(samples[0..<fade].map(abs).max() ?? 1, 1)
        XCTAssertEqual(samples[fade..<(samples.count - fade)].map(abs).max() ?? 0, 1, accuracy: 0.01)
    }

    // The phones and the browser sound the same two notes, so the shapes are
    // the ones `web/src/native/cueTone.ts` names.
    func testCarriesTheSameTwoShapesTheBrowserSounds() throws {
        XCTAssertEqual(try XCTUnwrap(toneShapes["ahead"]).hertz, 1320)
        XCTAssertEqual(try XCTUnwrap(toneShapes["ahead"]).beeps, 2)
        XCTAssertEqual(try XCTUnwrap(toneShapes["behind"]).hertz, 440)
        XCTAssertEqual(try XCTUnwrap(toneShapes["behind"]).beeps, 1)
    }
}
