package studio.getstronger.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import java.util.Collections;
import java.util.Locale;
import java.util.Set;

/**
 * Which of the engine's voices announces an interval, and how a cue is closed
 * off.
 *
 * Mirrors {@code AnnouncementVoice.swift} and
 * {@code web/src/native/announcementVoice.ts}: one ranking per platform, used
 * by everything that speaks. The service used to set a language and take
 * whatever the engine handed back, which is its flattest voice.
 */
final class AnnouncementVoice {
    private AnnouncementVoice() {}

    /**
     * The regions the app has already chosen for the languages it speaks,
     * mirroring {@code dateLocale()} in {@code web/src/i18n/index.ts}. Voices
     * come per region and the web app knows only a language.
     */
    static Locale locale(String language) {
        String lowered = language == null ? "en" : language.toLowerCase(Locale.ROOT);
        if (lowered.equals("en")) return Locale.forLanguageTag("en-GB");
        if (lowered.equals("sv")) return Locale.forLanguageTag("sv-SE");
        return Locale.forLanguageTag(lowered);
    }

    /**
     * Sets the language and the best-sounding voice installed for it.
     *
     * Unlike the web, Android says outright how good a voice is, so the name
     * is never read. Ties go to a voice the phone can say on its own: a run is
     * where the signal goes, and an announcement that needed the network is an
     * announcement nobody hears.
     */
    static void choose(TextToSpeech speech, String language) {
        Locale wanted = locale(language);
        speech.setLanguage(wanted);
        Voice best = null;
        for (Voice voice : voices(speech)) {
            if (voice == null || voice.getLocale() == null) continue;
            if (!voice.getLocale().getLanguage().equals(wanted.getLanguage())) continue;
            if (best == null || rank(voice, wanted) > rank(best, wanted)) best = voice;
        }
        if (best != null) speech.setVoice(best);
    }

    private static Set<Voice> voices(TextToSpeech speech) {
        try {
            Set<Voice> offered = speech.getVoices();
            return offered == null ? Collections.emptySet() : offered;
        } catch (Exception error) {
            // Some engines throw rather than answer; the language alone is
            // then what the announcements are said in, as before.
            return Collections.emptySet();
        }
    }

    /**
     * Where a voice stands, best last: the app's own region first, then how
     * good the engine says it is, then whether it can be said offline.
     *
     * The weights keep that order whatever the engine reports — a quality runs
     * to 500, so the region has to be worth more than any of them.
     */
    private static int rank(Voice voice, Locale wanted) {
        int region = voice.getLocale().getCountry().equalsIgnoreCase(wanted.getCountry()) ? 1 : 0;
        int offline = voice.isNetworkConnectionRequired() ? 0 : 1;
        return region * 10000 + voice.getQuality() * 10 + offline;
    }

    /**
     * A cue closed off with a full stop, which is what makes a synthesiser
     * fall away at the end of it instead of clipping the last word.
     */
    static String phrase(String instruction) {
        String cue = instruction == null ? "" : instruction.trim();
        if (cue.isEmpty()) return cue;
        return ".!?,:;".indexOf(cue.charAt(cue.length() - 1)) >= 0 ? cue : cue + ".";
    }
}
