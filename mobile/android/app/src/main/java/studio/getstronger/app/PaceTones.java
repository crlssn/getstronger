package studio.getstronger.app;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

/**
 * The two notes that say how an interval is going against the session it is
 * paced against, mirroring {@code paceTones} in {@code web/src/native/cueTone.ts}.
 *
 * <p>Shared by the recording service and by the settings examples, which are
 * sounded by the plugin rather than the page: a note the WebView played went
 * out on whichever stream WebKit had chosen for it, and was never the note a
 * run plays.
 */
final class PaceTones {
    /**
     * How loud a pace note is against a full-volume announcement: a fifth was
     * lost under a footfall on a busy road.
     */
    static final double VOLUME = 0.6;

    /**
     * The shape of one of the two notes.
     *
     * <p>Pitch alone is a poor signal on a road: a fifth is hard to place under
     * music and behind a footfall. Rhythm carries where pitch does not, so
     * ahead is two quick taps and behind is one long note — told apart by
     * counting, which needs no ear at all.
     */
    private static final class Shape {
        /** How long one beep lasts, and the silence between them, in seconds. */
        final double hertz, seconds, gapSeconds;
        /** How many beeps the note is made of. */
        final int beeps;
        /** How loud, as a fraction of the level the note is played at. */
        final double level;

        Shape(double hertz, double seconds, int beeps, double gapSeconds, double level) {
            this.hertz = hertz;
            this.seconds = seconds;
            this.beeps = beeps;
            this.gapSeconds = gapSeconds;
            this.level = level;
        }
    }

    private static final Shape AHEAD = new Shape(1320, 0.07, 2, 0.06, 0.6);
    private static final Shape BEHIND = new Shape(440, 0.6, 1, 0, 1);
    private static final int RATE = 44100;
    /** Ramped rather than switched at both ends: a square edge on a sine is heard as a click. */
    private static final double FADE_SECONDS = 0.01;

    /**
     * One note as a track of silence with the shape's beeps written into it,
     * generated rather than shipped; a name nothing sounds gives back null.
     */
    static AudioTrack note(String zone) {
        Shape shape = zone.equals("ahead") ? AHEAD : zone.equals("behind") ? BEHIND : null;
        if (shape == null) return null;
        int beepFrames = (int) (RATE * shape.seconds);
        int gapFrames = (int) (RATE * shape.gapSeconds);
        short[] samples = new short[beepFrames * shape.beeps + gapFrames * (shape.beeps - 1)];
        double fadeFrames = RATE * FADE_SECONDS;
        for (int beep = 0; beep < shape.beeps; beep++) {
            int start = beep * (beepFrames + gapFrames);
            for (int frame = 0; frame < beepFrames; frame++) {
                double fade = Math.min(1.0, Math.min(frame, beepFrames - frame) / fadeFrames);
                double wave = Math.sin(2 * Math.PI * shape.hertz * frame / RATE);
                // The shape's own level is baked in rather than set on the
                // track, whose volume carries the announcement level for both.
                samples[start + frame] = (short) (wave * Short.MAX_VALUE * fade * shape.level);
            }
        }
        AudioTrack track = new AudioTrack.Builder()
            // Media rather than a system sound: the note follows the volume
            // the announcements play at, not the one the ringer is set to.
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(samples.length * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        track.write(samples, 0, samples.length);
        return track;
    }

    /** Sounds a prepared note from its start; one already playing begins again. */
    static void play(AudioTrack track, double level) {
        if (track == null || level <= 0) return;
        try {
            track.setVolume((float) (VOLUME * level));
            track.stop();
            track.reloadStaticData();
            track.play();
        } catch (IllegalStateException error) { /* A note nobody hears is not worth a failed session. */ }
    }

    private PaceTones() {}
}
