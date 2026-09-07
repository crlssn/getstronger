package studio.getstronger.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** The foreground service owns the clock, speech and private recording file. */
public class TimedCircuitService extends Service implements LocationListener {
    private static final String CHANNEL = "timed-circuit";
    private static final int TONE_VOLUME = 100;
    private static final int TONE_MS = 200;
    /** How loud a pace note is against a full-volume announcement. */
    private static final double PACE_TONE_VOLUME = 0.2;
    private static JSONObject saved;
    private static TimedCircuitService active;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;
    private TextToSpeech speech;
    private ToneGenerator tones;
    private boolean speechReady;
    private int spoken = -1;
    /** The interval already warned about, so the tone sounds once per interval. */
    private int cued = -1;
    private long checkpoint;
    // The session this one is paced against, as the web app settled it: a
    // target for each interval, and the three numbers that say when a
    // difference is worth hearing. No targets is a recording with nothing to
    // compare against, which is every first recording of a routine.
    private double[] paceTargets = new double[0];
    private double paceTolerance;
    private double paceGap;
    private double paceWindow;
    private String paceZone = "";
    private int paceZonePhase = -1;
    private long paceTonedAt;
    private AudioTrack aheadTone;
    private AudioTrack behindTone;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            try { tick(); if (active != null) handler.postDelayed(this, 250); }
            catch (Exception error) { fail(); }
        }
    };
    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), "timed-circuit.json"));
    }
    private static void load(Context context) throws Exception {
        if (saved != null || !file(context).getBaseFile().exists()) return;
        saved = new JSONObject(new String(file(context).readFully(), StandardCharsets.UTF_8));
        JSONObject data = saved.getJSONObject("recording");
        if (!data.has("endedAt")) {
            data.put("interrupted", true);
            close(data, saved.getLong("checkpoint"));
            persist(context);
        }
    }
    static void prepare(Context context, JSONObject options) throws Exception {
        load(context);
        if (saved != null) throw new IllegalStateException("Another recording exists");
        JSONArray phases = options.getJSONArray("phases");
        if (phases.length() == 0 || phases.length() > 10000) throw new IllegalArgumentException("Invalid prescription");
        // A lone phase naming no duration is the open interval of a session with
        // no set length; every other prescription is held against the clock.
        if (phases.length() > 1 || !phases.getJSONObject(0).isNull("durationSeconds")) {
            for (int i = 0; i < phases.length(); i++) {
                int duration = phases.getJSONObject(i).optInt("durationSeconds", 0);
                if (duration <= 0 || duration > 86400) throw new IllegalArgumentException("Invalid duration");
            }
        }
        long now = System.currentTimeMillis();
        JSONObject data = new JSONObject().put("version", 1).put("startedAt", now)
            .put("phases", phases).put("pauses", new JSONArray()).put("points", new JSONArray()).put("interrupted", false);
        saved = new JSONObject().put("key", options.getString("key")).put("locale", options.optString("locale", "en"))
            .put("volume", level(options.optDouble("volume", 1)))
            .put("cueLeadSeconds", options.optInt("cueLeadSeconds", 10))
            .put("recording", data).put("checkpoint", now);
        if (options.optJSONObject("pacing") != null) saved.put("pacing", options.getJSONObject("pacing"));
        try { persist(context); } catch (Exception error) { saved = null; throw error; }
    }
    static JSONObject read(Context context, String key) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return new JSONObject();
        if (active != null) active.tick();
        return new JSONObject().put("recording", saved.getJSONObject("recording"));
    }
    /** How loudly the phases are announced, 0 to 1; 0 speaks nothing at all. */
    private static double level(double volume) {
        return Math.min(Math.max(volume, 0), 1);
    }
    static void setVolume(Context context, String key, double volume) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return;
        double next = level(volume);
        saved.put("volume", next);
        if (next == 0 && active != null && active.speech != null) active.speech.stop();
        persist(context);
    }
    static void command(Context context, String key, String command) throws Exception {
        load(context);
        if (saved == null || !saved.getString("key").equals(key)) return;
        JSONObject data = saved.getJSONObject("recording");
        long now = System.currentTimeMillis();
        if (command.equals("clear")) {
            if (active != null) active.stopRecording();
            file(context).delete(); saved = null; return;
        }
        if (data.has("endedAt")) return;
        if (active != null) active.tick();
        if (data.has("endedAt")) return;
        JSONArray pauses = data.getJSONArray("pauses");
        boolean paused = pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt");
        if (command.equals("pause") && !paused) {
            pauses.put(new JSONObject().put("startedAt", now));
            if (active != null && active.speech != null) active.speech.stop();
        } else if (command.equals("resume") && paused) {
            pauses.getJSONObject(pauses.length() - 1).put("endedAt", now);
        } else if (command.equals("finish")) {
            close(data, now);
            if (active != null) active.stopRecording();
        }
        persist(context);
    }
    private static void close(JSONObject data, long time) throws Exception {
        data.put("endedAt", time);
        JSONArray pauses = data.getJSONArray("pauses");
        if (pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt")) {
            pauses.getJSONObject(pauses.length() - 1).put("endedAt", time);
        }
    }
    private static void persist(Context context) throws Exception {
        if (saved == null) return;
        saved.put("checkpoint", System.currentTimeMillis());
        AtomicFile file = file(context);
        FileOutputStream stream = file.startWrite();
        try { stream.write(saved.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
        catch (Exception error) { file.failWrite(stream); throw error; }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            load(this);
            if (saved == null || saved.getJSONObject("recording").has("endedAt")) { stopSelf(); return START_NOT_STICKY; }
            active = this;
            NotificationManager notifications = getSystemService(NotificationManager.class);
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.app_name), NotificationManager.IMPORTANCE_LOW));
            startForeground(1382, notification(saved.getJSONObject("recording").getJSONArray("phases").getJSONObject(0).getString("instruction")));
            wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "getstronger:timed-circuit");
            wakeLock.acquire(86400000L);
            locations = getSystemService(LocationManager.class);
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
            // The tone that warns an interval is about to end. A generator the
            // platform owns needs no asset of ours, and a device that refuses
            // one records on in silence.
            try { tones = new ToneGenerator(AudioManager.STREAM_MUSIC, TONE_VOLUME); }
            catch (Exception ignored) { tones = null; }
            readPacing(saved.optJSONObject("pacing"));
            speech = new TextToSpeech(this, status -> {
                if (status == TextToSpeech.SUCCESS) {
                    speechReady = true;
                    speech.setLanguage(Locale.forLanguageTag(saved.optString("locale", "en")));
                } else { fail(); }
            });
            handler.post(ticker);
        } catch (Exception error) { fail(); }
        return START_NOT_STICKY;
    }
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(R.string.app_name)).setContentText(text).setContentIntent(open).setOngoing(true).build();
    }
    private void tick() throws Exception {
        if (saved == null || active == null) return;
        JSONObject data = saved.getJSONObject("recording");
        if (data.has("endedAt")) return;
        long now = System.currentTimeMillis();
        long elapsed = now - data.getLong("startedAt");
        if (elapsed >= 86400000L) { fail(); return; }
        JSONArray pauses = data.getJSONArray("pauses");
        for (int i = 0; i < pauses.length(); i++) {
            JSONObject pause = pauses.getJSONObject(i);
            if (!pause.has("endedAt")) return;
            elapsed -= pause.getLong("endedAt") - pause.getLong("startedAt");
        }
        JSONArray phases = data.getJSONArray("phases");
        long boundary = 0;
        for (int index = 0; index < phases.length(); index++) {
            JSONObject phase = phases.getJSONObject(index);
            boolean open = phase.isNull("durationSeconds");
            long opened = boundary;
            if (!open) boundary += phase.getLong("durationSeconds") * 1000;
            if (open || elapsed < boundary) {
                if (spoken != index && speechReady) {
                    if (spoken >= 0 && index > spoken + 1) data.put("interrupted", true);
                    spoken = index;
                    String instruction = phase.getString("instruction");
                    if (announce(instruction, index) == TextToSpeech.ERROR) data.put("interrupted", true);
                    getSystemService(NotificationManager.class).notify(1382, notification(instruction));
                }
                long lead = saved.optInt("cueLeadSeconds", 10) * 1000L;
                if (cued != index && cues(phase, lead) && elapsed >= boundary - lead) {
                    cued = index;
                    if (tones != null) tones.startTone(ToneGenerator.TONE_PROP_BEEP, TONE_MS);
                }
                judge(index, (elapsed - opened) / 1000.0, now);
                if (now - checkpoint > 1000) { persist(this); checkpoint = now; }
                return;
            }
        }
        close(data, now - (elapsed - boundary));
        persist(this);
        stopRecording();
    }
    /** Turned all the way down speaks nothing: a silent utterance still ducks whatever is playing. */
    private int announce(String instruction, int index) {
        double volume = level(saved.optDouble("volume", 1));
        if (volume == 0) return TextToSpeech.SUCCESS;
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, (float) volume);
        return speech.speak(instruction, TextToSpeech.QUEUE_FLUSH, params, "phase-" + index);
    }
    /**
     * Whether an interval is long enough to be worth warning about.
     *
     * A cue at or before the midpoint is a second instruction rather than a
     * warning, so anything shorter than twice the lead runs out unannounced.
     */
    private static boolean cues(JSONObject phase, long leadMs) throws Exception {
        if (leadMs <= 0 || phase.isNull("durationSeconds")) return false;
        return phase.getLong("durationSeconds") * 1000L >= leadMs * 2;
    }

    /** The comparison the recorder holds each interval to, or none at all. */
    private void readPacing(JSONObject pacing) {
        paceZone = "";
        paceZonePhase = -1;
        paceTonedAt = 0;
        if (pacing == null) return;
        JSONArray targets = pacing.optJSONArray("targets");
        paceTargets = new double[targets == null ? 0 : targets.length()];
        for (int index = 0; index < paceTargets.length; index++) paceTargets[index] = targets.optDouble(index, 0);
        paceTolerance = pacing.optDouble("toleranceSeconds", 0);
        paceGap = pacing.optDouble("minimumGapSeconds", 0);
        paceWindow = pacing.optDouble("windowSeconds", 0);
        if (paceTargets.length == 0) return;
        // Higher for ahead and lower for behind, generated rather than
        // shipped: the same two notes the browser recorder sounds. Both sit
        // clear of the cue, so three sounds in one run are three sounds.
        aheadTone = note(1320);
        behindTone = note(440);
    }

    private AudioTrack note(double hertz) {
        int rate = 44100;
        int frames = (int) (rate * 0.18);
        short[] samples = new short[frames];
        for (int frame = 0; frame < frames; frame++) {
            // Faded at both ends: a square edge on a sine is heard as a click.
            double fade = Math.min(1.0, Math.min(frame, frames - frame) / (rate * 0.02));
            samples[frame] = (short) (Math.sin(2 * Math.PI * hertz * frame / rate) * Short.MAX_VALUE * fade);
        }
        AudioTrack track = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(rate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(samples.length * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build();
        track.write(samples, 0, samples.length);
        return track;
    }

    /** A note follows the announcement volume: a session that says nothing must not beep. */
    private void play(String zone) {
        AudioTrack track = zone.equals("ahead") ? aheadTone : behindTone;
        double volume = level(saved.optDouble("volume", 1));
        if (track == null || volume == 0) return;
        try {
            track.setVolume((float) (PACE_TONE_VOLUME * volume));
            track.stop();
            track.reloadStaticData();
            track.play();
        } catch (IllegalStateException error) { /* A note nobody hears is not worth a failed session. */ }
    }

    /**
     * Whether the movement between two fixes is worth measuring, on the same
     * terms the app measures a saved route on.
     */
    private boolean accepted(JSONObject a, JSONObject b, JSONArray pauses) throws Exception {
        double seconds = (b.getLong("timestamp") - a.getLong("timestamp")) / 1000.0;
        if (seconds <= 0 || seconds > 15) return false;
        if (a.optDouble("accuracy", 0) > 30 || b.optDouble("accuracy", 0) > 30) return false;
        if (metres(a, b) / seconds > 15) return false;
        for (int index = 0; index < pauses.length(); index++) {
            JSONObject pause = pauses.getJSONObject(index);
            long ended = pause.has("endedAt") ? pause.getLong("endedAt") : Long.MAX_VALUE;
            if (a.getLong("timestamp") < ended && b.getLong("timestamp") > pause.getLong("startedAt")) return false;
        }
        return true;
    }

    private double metres(JSONObject a, JSONObject b) throws Exception {
        double from = Math.toRadians(a.getDouble("latitude"));
        double to = Math.toRadians(b.getDouble("latitude"));
        double latitude = to - from;
        double longitude = Math.toRadians(b.getDouble("longitude") - a.getDouble("longitude"));
        double h = Math.pow(Math.sin(latitude / 2), 2)
            + Math.cos(from) * Math.cos(to) * Math.pow(Math.sin(longitude / 2), 2);
        return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /**
     * Pace over the trailing window in seconds per kilometre, or nothing: one
     * fix is a position rather than a speed.
     */
    private double currentPace(long time) throws Exception {
        JSONObject data = saved.getJSONObject("recording");
        JSONArray points = data.getJSONArray("points");
        JSONArray pauses = data.getJSONArray("pauses");
        double since = time - paceWindow * 1000;
        double covered = 0;
        double seconds = 0;
        for (int index = 1; index < points.length(); index++) {
            JSONObject a = points.getJSONObject(index - 1);
            JSONObject b = points.getJSONObject(index);
            long closed = b.getLong("timestamp");
            // Whole edges, by the fix that closed them, as the app measures.
            if (closed <= since || closed > time || !accepted(a, b, pauses)) continue;
            covered += metres(a, b);
            seconds += (closed - a.getLong("timestamp")) / 1000.0;
        }
        return covered > 0 ? (seconds / covered) * 1000 : 0;
    }

    /**
     * Sounds the crossing where this interval leaves the band the reference
     * session set for it, at most once every gap.
     */
    private void judge(int index, double seconds, long time) throws Exception {
        // Turned off, nothing is judged rather than judged and swallowed:
        // turning the sound back on hears the next crossing rather than
        // missing it.
        if (level(saved.optDouble("volume", 1)) == 0) return;
        if (paceZonePhase != index) {
            paceZonePhase = index;
            paceZone = "";
        }
        if (index >= paceTargets.length) return;
        double target = paceTargets[index];
        if (target <= 0 || seconds < paceWindow) return;
        double pace = currentPace(time);
        if (pace <= 0) return;

        String zone = pace < target - paceTolerance ? "ahead" : pace > target + paceTolerance ? "behind" : "holding";
        if (zone.equals("holding")) {
            paceZone = zone;
            return;
        }
        // A crossing the gap swallowed stays pending, so it is heard late
        // rather than not at all.
        if (zone.equals(paceZone) || (paceTonedAt != 0 && time - paceTonedAt < paceGap * 1000)) return;
        paceZone = zone;
        paceTonedAt = time;
        play(zone);
    }

    @Override public void onLocationChanged(Location location) {
        try {
            tick();
            if (active == null) return;
            JSONObject data = saved.getJSONObject("recording");
            JSONArray pauses = data.getJSONArray("pauses");
            if (pauses.length() > 0 && !pauses.getJSONObject(pauses.length() - 1).has("endedAt")) return;
            JSONArray points = data.getJSONArray("points");
            long timestamp = location.getTime();
            if (timestamp < data.getLong("startedAt") || timestamp > System.currentTimeMillis() ||
                points.length() > 0 && timestamp <= points.getJSONObject(points.length() - 1).getLong("timestamp")) return;
            if (points.length() >= 90000) { fail(); return; }
            points.put(new JSONObject().put("timestamp", timestamp).put("latitude", location.getLatitude())
                .put("longitude", location.getLongitude()).put("accuracy", location.hasAccuracy() ? location.getAccuracy() : 10000));
            persist(this);
        } catch (Exception error) { fail(); }
    }
    @Override public void onProviderDisabled(String provider) { fail(); }
    private void fail() {
        try {
            if (saved != null) {
                JSONObject data = saved.getJSONObject("recording");
                data.put("interrupted", true);
                if (!data.has("endedAt")) close(data, System.currentTimeMillis());
                persist(this);
            }
        } catch (Exception ignored) { /* The UI retains the last readable checkpoint as interrupted. */ }
        stopRecording();
    }
    private void stopRecording() {
        handler.removeCallbacks(ticker);
        if (locations != null) locations.removeUpdates(this);
        if (speech != null) { speech.stop(); speech.shutdown(); speech = null; }
        if (tones != null) { tones.release(); tones = null; }
        if (aheadTone != null) { aheadTone.release(); aheadTone = null; }
        if (behindTone != null) { behindTone.release(); behindTone = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        active = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }
    @Override public void onDestroy() { if (active == this) fail(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
