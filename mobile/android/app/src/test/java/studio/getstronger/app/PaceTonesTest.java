package studio.getstronger.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PaceTonesTest {
    private static final int RATE = 44100;

    private static int peak(short[] samples, int from, int to) {
        int peak = 0;
        for (int i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
        return peak;
    }

    // Two taps of 70ms with 60ms of silence between them, as the browser
    // recorder sounds them.
    @Test public void writesEachBeepAndTheSilenceBetweenThem() {
        short[] samples = PaceTones.samples("ahead");
        int beep = (int) (RATE * 0.07);
        int gap = (int) (RATE * 0.06);
        assertEquals(beep * 2 + gap, samples.length);
        assertEquals(0, peak(samples, beep, beep + gap));
        assertTrue(peak(samples, beep + gap, samples.length) > 0);
    }

    // The shape's own level is baked in, so the track volume can carry one
    // level for both notes.
    @Test public void bakesTheShapesOwnLevelIntoTheWave() {
        assertEquals(0.6, peak(PaceTones.samples("ahead"), 0, PaceTones.samples("ahead").length) / (double) Short.MAX_VALUE, 0.01);
        assertEquals(1, peak(PaceTones.samples("behind"), 0, PaceTones.samples("behind").length) / (double) Short.MAX_VALUE, 0.01);
    }

    // A square edge on a sine is heard as a click, so both ends ramp.
    @Test public void rampsBothEndsOfEveryBeep() {
        short[] samples = PaceTones.samples("behind");
        int fade = (int) (RATE * 0.01);
        assertEquals(0, samples[0]);
        assertTrue(Math.abs(samples[samples.length - 1]) < Short.MAX_VALUE * 0.001);
        assertTrue(peak(samples, 0, fade) < Short.MAX_VALUE);
        assertEquals(Short.MAX_VALUE, peak(samples, fade, samples.length - fade), Short.MAX_VALUE * 0.01);
    }

    @Test public void soundsNothingForANameNoButtonSends() {
        assertNull(PaceTones.samples("level"));
    }
}
