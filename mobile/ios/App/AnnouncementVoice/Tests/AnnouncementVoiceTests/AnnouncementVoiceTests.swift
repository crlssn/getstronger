import XCTest

@testable import AnnouncementVoice

private func voice(_ identifier: String, _ language: String, _ quality: VoiceQuality) -> SpokenVoice {
    SpokenVoice(identifier: identifier, language: language, quality: quality)
}

final class AnnouncementLocaleTests: XCTestCase {
    func testGivesABareLanguageTheRegionTheAppAlreadyUses() {
        XCTAssertEqual(announcementLocale("en"), "en-GB")
        XCTAssertEqual(announcementLocale("sv"), "sv-SE")
    }

    func testLeavesALocaleThatNamesItsOwnRegionAlone() {
        XCTAssertEqual(announcementLocale("en-US"), "en-US")
    }

    func testReadsTheLanguageWhateverItsCase() {
        XCTAssertEqual(announcementLocale("EN"), "en-GB")
    }
}

final class BestVoiceTests: XCTestCase {
    private let installed = [
        voice("standard.en-GB", "en-GB", .standard),
        voice("enhanced.en-GB", "en-GB", .enhanced),
        voice("premium.en-GB", "en-GB", .premium),
    ]

    func testPrefersPremium() {
        XCTAssertEqual(bestVoice(for: "en", among: installed)?.identifier, "premium.en-GB")
    }

    func testFallsBackToEnhancedWhenNoPremiumIsInstalled() {
        let voices = installed.filter { $0.quality != .premium }
        XCTAssertEqual(bestVoice(for: "en", among: voices)?.identifier, "enhanced.en-GB")
    }

    func testChoosesNothingWhenOnlyStandardVoicesAreInstalled() {
        let voices = installed.filter { $0.quality == .standard }
        XCTAssertNil(bestVoice(for: "en", among: voices))
    }

    func testChoosesNothingWhenTheLanguageHasNoVoiceAtAll() {
        XCTAssertNil(bestVoice(for: "sv", among: installed))
        XCTAssertNil(bestVoice(for: "en", among: []))
    }

    func testPrefersTheAppsRegionOverABetterVoiceElsewhere() {
        let voices = [voice("premium.en-US", "en-US", .premium), voice("enhanced.en-GB", "en-GB", .enhanced)]
        XCTAssertEqual(bestVoice(for: "en", among: voices)?.identifier, "enhanced.en-GB")
    }

    func testTakesAnotherRegionWhenTheAppsHasNothingBetterThanStandard() {
        let voices = [voice("premium.en-US", "en-US", .premium), voice("standard.en-GB", "en-GB", .standard)]
        XCTAssertEqual(bestVoice(for: "en", among: voices)?.identifier, "premium.en-US")
    }

    func testMatchesTheRegionWhateverItsCase() {
        let voices = [voice("premium.en-gb", "EN-gb", .premium), voice("premium.en-US", "en-US", .premium)]
        XCTAssertEqual(bestVoice(for: "en", among: voices)?.identifier, "premium.en-gb")
    }

    func testSettlesATieOnTheIdentifierSoAPhoneAlwaysPicksTheSameVoice() {
        let voices = [voice("b.en-GB", "en-GB", .premium), voice("a.en-GB", "en-GB", .premium)]
        XCTAssertEqual(bestVoice(for: "en", among: voices)?.identifier, "a.en-GB")
        XCTAssertEqual(bestVoice(for: "en", among: voices.reversed())?.identifier, "a.en-GB")
    }
}

final class AnnouncementPhraseTests: XCTestCase {
    func testClosesACueThatEndsWithoutPunctuation() {
        XCTAssertEqual(announcementPhrase("Round 2 of 5"), "Round 2 of 5.")
    }

    func testLeavesACueThatPunctuatesItself() {
        XCTAssertEqual(announcementPhrase("Rest."), "Rest.")
        XCTAssertEqual(announcementPhrase("Go!"), "Go!")
    }

    func testTrimsBeforeItPunctuates() {
        XCTAssertEqual(announcementPhrase("  Sprint  "), "Sprint.")
    }

    func testLeavesAnEmptyCueSilent() {
        XCTAssertEqual(announcementPhrase("   "), "")
    }
}
