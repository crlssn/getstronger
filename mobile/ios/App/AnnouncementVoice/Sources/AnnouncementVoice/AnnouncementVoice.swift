import Foundation

/// How natural a voice sounds, worst first. Mirrors
/// `AVSpeechSynthesisVoiceQuality` without depending on it, so the ranking
/// builds and runs wherever Swift does.
enum VoiceQuality: Int, Comparable {
    case standard
    case enhanced
    case premium

    static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

/// An installed voice as the ranking reads it.
struct SpokenVoice {
    let identifier: String
    let language: String
    let quality: VoiceQuality
}

/// The regions the app has already chosen for the languages it speaks,
/// mirroring `dateLocale()` in `web/src/i18n/index.ts`.
private let regions = ["en": "en-GB", "sv": "sv-SE"]

/// The locale the announcements are spoken in. The web sends a bare language
/// and voices come per region, so an unqualified one is given the app's.
func announcementLocale(_ locale: String) -> String {
    regions[locale.lowercased()] ?? locale
}

/// The best-sounding installed voice for `locale`, or nil when none of them
/// beats what the synthesiser would have picked on its own.
///
/// Only an upgrade is ever reported, so a phone carrying nothing but the
/// standard voices keeps the voice it already announced in.
func bestVoice(for locale: String, among voices: [SpokenVoice]) -> SpokenVoice? {
    let wanted = announcementLocale(locale)
    let candidates = voices.filter {
        $0.quality > .standard && language(of: $0.language) == language(of: wanted)
    }
    // Ties are settled on the identifier so a phone offered two equals always
    // announces in the same one.
    return candidates.max { left, right in
        let ranks = (rank(left, for: wanted), rank(right, for: wanted))
        return ranks.0 == ranks.1 ? left.identifier > right.identifier : ranks.0 < ranks.1
    }
}

/// Where a voice stands, best last. The app's own region comes first: an
/// enhanced British voice is a better cue than a premium American one.
private func rank(_ voice: SpokenVoice, for locale: String) -> (region: Int, quality: Int) {
    (voice.language.lowercased() == locale.lowercased() ? 1 : 0, voice.quality.rawValue)
}

/// The language a locale names, with its region and its case dropped.
private func language(of locale: String) -> Substring {
    locale.lowercased().prefix { $0 != "-" }
}

/// A cue closed off with a full stop, which is what makes the synthesiser fall
/// away at the end of a phase instead of clipping it.
func announcementPhrase(_ instruction: String) -> String {
    let cue = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let last = cue.last, !".!?,:;".contains(last) else { return cue }
    return cue + "."
}

/// The token a phrase holds a pause at, mirroring `pausePlaceholder` in
/// `web/src/native/announcementVoice.ts`.
let pausePlaceholder = "{pause}"

/// How long the synthesiser waits at one, in seconds.
let announcementPauseSeconds = 0.5

/// A phrase as the parts the synthesiser says it in, each closed off.
///
/// A full stop is the only pause a phrase can carry on its own, and no engine
/// gives one much of a beat. A phrase that wants one is split here, and the
/// wait is asked of `AVSpeechUtterance.preUtteranceDelay` instead.
func announcementParts(_ instruction: String) -> [String] {
    instruction.components(separatedBy: pausePlaceholder)
        .map(announcementPhrase)
        .filter { !$0.isEmpty }
}
